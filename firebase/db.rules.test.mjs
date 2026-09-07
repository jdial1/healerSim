// Realtime Database rules for the live relay, against the emulator.
//
// The relay is where a hostile client does the most damage: a forged broadcast
// frame is not one player cheating, it is everybody else's fight being rewritten.
// The host-authoritative design cannot stop the *host* lying -- that is the
// accepted v1 trade -- but it must stop anybody else pretending to be one.
import { test, before, after } from "node:test";
import { initializeTestEnvironment, assertFails, assertSucceeds } from "@firebase/rules-unit-testing";
import { readFileSync } from "node:fs";
import { ref, set, get, serverTimestamp } from "firebase/database";

const SERVER_TIME = serverTimestamp();

let env;

const roomNode = (host, members) => ({
  hostUid: host,
  members: Object.fromEntries(members.map((m) => [m, true])),
  state: { tick: 1 },
});

before(async () => {
  env = await initializeTestEnvironment({
    projectId: "overheal-local",
    database: {
      rules: readFileSync("database.rules.json", "utf8"),
      host: "127.0.0.1",
      port: 9000,
    },
  });
});
after(async () => { await env?.cleanup(); });

const as = (uid) => env.authenticatedContext(uid).database();
const anon = () => env.unauthenticatedContext().database();
const seed = (fn) => env.withSecurityRulesDisabled((ctx) => fn(ctx.database()));

test("a signed-out client can neither read nor write a room", async () => {
  await seed((db) => set(ref(db, "rooms/r1"), roomNode("alice", ["alice", "bob"])));
  await assertFails(get(ref(anon(), "rooms/r1")));
  await assertFails(set(ref(anon(), "rooms/r1/state"), { tick: 2 }));
});

test("a host creates its own room and broadcasts into it", async () => {
  await assertSucceeds(set(ref(as("alice"), "rooms/d1_alice_bob_2"), roomNode("alice", ["alice", "bob"])));
  await assertSucceeds(set(ref(as("alice"), "rooms/d1_alice_bob_2/state"), { tick: 5 }));
});

test("a room cannot be created naming somebody else as host", async () => {
  await assertFails(set(ref(as("mallory"), "rooms/d1_alice"), roomNode("alice", ["alice"])));
  // Nor by a host who is not in their own room.
  await assertFails(set(ref(as("mallory"), "rooms/d1_mallory_x"), roomNode("mallory", ["alice"])));
});

test("an outsider cannot squat a room id before its group claims it", async () => {
  // Room ids are derived from the group's uids so every client computes the
  // same one without coordinating -- which also makes them guessable. An
  // outsider creating the room first would lock out its real host, so the id
  // has to name you even though you are naming yourself host.
  const id = "d1_alice_bob";
  await assertFails(set(ref(as("mallory"), `rooms/${id}`), roomNode("mallory", ["mallory"])));
  await assertSucceeds(set(ref(as("alice"), `rooms/${id}`), roomNode("alice", ["alice", "bob"])));
  await assertFails(set(ref(as("mallory"), `rooms/${id}/state`), { tick: 99 }));

  // Mallory may of course host a room of their own.
  await assertSucceeds(set(ref(as("mallory"), "rooms/d1_mallory"), roomNode("mallory", ["mallory"])));
});

test("only members read the room", async () => {
  await seed((db) => set(ref(db, "rooms/r6"), roomNode("alice", ["alice", "bob"])));
  await assertSucceeds(get(ref(as("bob"), "rooms/r6")));
  await assertFails(get(ref(as("carol"), "rooms/r6")));
});

test("a guest cannot forge the broadcast frame", async () => {
  // The whole point of host authority: one client simulates, and the others
  // must not be able to overwrite what it published.
  await seed((db) => set(ref(db, "rooms/r7"), roomNode("alice", ["alice", "bob"])));
  await assertFails(set(ref(as("bob"), "rooms/r7/state"), { tick: 999 }));
  await assertSucceeds(set(ref(as("alice"), "rooms/r7/state"), { tick: 2 }));
});

test("a guest writes only its own action stream", async () => {
  await seed((db) => set(ref(db, "rooms/r8"), roomNode("alice", ["alice", "bob"])));
  await assertSucceeds(set(ref(as("bob"), "rooms/r8/actions/bob"), { spellId: "x" }));
  await assertFails(set(ref(as("bob"), "rooms/r8/actions/alice"), { spellId: "x" }));
  await assertFails(set(ref(as("carol"), "rooms/r8/actions/carol"), { spellId: "x" }));
});

test("the host reads every action stream, because it is the one simulating", async () => {
  await seed((db) => set(ref(db, "rooms/r9"), roomNode("alice", ["alice", "bob"])));
  await seed((db) => set(ref(db, "rooms/r9/actions/bob"), { spellId: "x" }));
  await assertSucceeds(get(ref(as("alice"), "rooms/r9/actions/bob")));
});

test("a heartbeat must be the server's clock, and must be your own", async () => {
  await seed((db) => set(ref(db, "rooms/d1_alice_bob_hb"), roomNode("alice", ["alice", "bob"])));
  // Forging a future timestamp would keep a dead room alive forever; backdating
  // somebody else's would force a migration that should not happen.
  await assertFails(set(ref(as("bob"), "rooms/d1_alice_bob_hb/heartbeats/bob"), Date.now() + 600000));
  await assertFails(set(ref(as("bob"), "rooms/d1_alice_bob_hb/heartbeats/alice"), SERVER_TIME));
  await assertSucceeds(set(ref(as("bob"), "rooms/d1_alice_bob_hb/heartbeats/bob"), SERVER_TIME));
});

test("a member cannot take the room from a host that is still beating", async () => {
  await seed(async (db) => {
    await set(ref(db, "rooms/d1_alice_bob_live"), roomNode("alice", ["alice", "bob"]));
    await set(ref(db, "rooms/d1_alice_bob_live/heartbeats/alice"), Date.now());
  });
  await assertFails(set(ref(as("bob"), "rooms/d1_alice_bob_live/hostUid"), "bob"));
});

test("a member takes over once the host's heartbeat has gone stale", async () => {
  await seed(async (db) => {
    await set(ref(db, "rooms/d1_alice_bob_dead"), roomNode("alice", ["alice", "bob"]));
    await set(ref(db, "rooms/d1_alice_bob_dead/heartbeats/alice"), 1);
  });
  // An outsider still cannot, however dead the host is.
  await assertFails(set(ref(as("carol"), "rooms/d1_alice_bob_dead/hostUid"), "carol"));
  // Nor can a member install somebody else as host.
  await assertFails(set(ref(as("bob"), "rooms/d1_alice_bob_dead/hostUid"), "carol"));
  await assertSucceeds(set(ref(as("bob"), "rooms/d1_alice_bob_dead/hostUid"), "bob"));
  // And the new host can now publish, which is the point of taking over.
  await assertSucceeds(set(ref(as("bob"), "rooms/d1_alice_bob_dead/state"), { tick: 7 }));
});

test("a profile is yours alone to publish", async () => {
  await seed((db) => set(ref(db, "rooms/d1_alice_bob_p"), roomNode("alice", ["alice", "bob"])));
  await assertSucceeds(set(ref(as("bob"), "rooms/d1_alice_bob_p/profiles/bob"), { json: "{}" }));
  // Rewriting somebody else's talents would change what their spells do.
  await assertFails(set(ref(as("bob"), "rooms/d1_alice_bob_p/profiles/alice"), { json: "{}" }));
  await assertFails(set(ref(as("carol"), "rooms/d1_alice_bob_p/profiles/carol"), { json: "{}" }));
});
