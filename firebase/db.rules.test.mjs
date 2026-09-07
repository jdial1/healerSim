// Realtime Database rules for the live relay, against the emulator.
//
// The relay is where a hostile client does the most damage: a forged broadcast
// frame is not one player cheating, it is everybody else's fight being rewritten.
// The host-authoritative design cannot stop the *host* lying -- that is the
// accepted v1 trade -- but it must stop anybody else pretending to be one.
import { test, before, after } from "node:test";
import { initializeTestEnvironment, assertFails, assertSucceeds } from "@firebase/rules-unit-testing";
import { readFileSync } from "node:fs";
import { ref, set, get } from "firebase/database";

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
