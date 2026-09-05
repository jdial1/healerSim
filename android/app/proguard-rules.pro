# R8 rules for the release build.
#
# kotlinx.serialization and the Compose artifacts ship their own consumer rules,
# which cover most of what this app needs. Only add here what those cannot see.

# --- enums are a disk format ------------------------------------------------
# Verified: without this rule R8 renames every constant (PRIEST -> e, and so on).
#
# kotlinx survives that — it captures enum serial names at compile time — but
# reflection does not. SaveStore writes the class as `cls.name` and reads it back
# with `PlayerClass.valueOf`, which then throws; load() falls back to an empty
# Roster, so the player silently loses their character. The break is invisible on
# a fresh install and appears only on the SECOND launch, which is exactly why a
# manual smoke test of the release build did not catch it.
#
# Scoped to all enums rather than just the reflected ones: keeping that
# distinction correct by hand is more fragile than keeping the lot, and the size
# cost is a few dozen bytes of string table.
-keepclassmembers enum com.jdial.aegis.** {
    public static **[] values();
    public static ** valueOf(java.lang.String);
    <fields>;
}

# --- @Serializable classes --------------------------------------------------
# The library's rules keep generated serializers; this keeps the Companion and
# serializer() lookup on our own classes, which is what reflection resolves.
-if @kotlinx.serialization.Serializable class com.jdial.aegis.**
-keepclassmembers class com.jdial.aegis.<1> {
    static <1>$Companion Companion;
    static kotlinx.serialization.KSerializer serializer(...);
}

-keepattributes RuntimeVisibleAnnotations,AnnotationDefault,Signature,InnerClasses,EnclosingMethod

# Nothing for Compose. The androidx.compose artifacts ship complete consumer
# rules; needing a keep rule here would mean something else is wrong.
