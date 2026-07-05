# Account Recovery — Plain-language Q&A (design discussion)

> This is the raw, layman-terms discussion that shaped Penny's account-lifecycle & recovery model
> (erase/reinstall/reclaim, why the username isn't a login, why recovery is essential, SRP vs Ed25519,
> auth ≠ decryption). Kept deliberately as an accessible walkthrough. **The canonical, current design +
> status lives in [`plans/phase-1.5-track-F-multi-device-recovery.md`](plans/phase-1.5-track-F-multi-device-recovery.md)**
> (recovery model) and [`plans/account-lifecycle-recovery.md`](plans/account-lifecycle-recovery.md)
> (worker mechanics). If those and this doc ever disagree, the plans win.

---

=> So, I have reset the data and then completed the onboarding flow and the app correctly says not claimed. I was able to claim the username. What happens now if

1. I do a reset again with erase all data.
2. I do a reset post erase all data.

3. Erase all data (now that you have a real claim)
   handleReset runs three steps (BackupPage.tsx:113-119):

Deregister first — a signed DELETE /account to penny-auth. Because you now hold real device keys + a server registration, this authenticates and the server deletes your user + devices, releasing your username. It's best-effort (.catch swallows failures); the 365-day inactivity GC is the backstop if the network hiccups.
Wipe locally — clears every Dexie table: profile (userId/username/deviceId), device_keys, group_keys, the security record (your wrapped DMK + PIN/passphrase salts), and all financial data. The keystore is locked (DMK leaves memory).
Redirect to onboarding.
Net: the device is blank and (assuming deregister succeeded) the server no longer holds your account. Anything not in a backup is gone irrecoverably — there's no DMK left to decrypt it.

Two caveats:

Drive backup is untouched. If auto-backup was on, the encrypted bundle still sits in your Drive — that's your recovery route.
Group rows aren't cleaned server-side. DELETE /account removes the auth user+devices, but your group_members/key-grants in the groups D1 are left orphaned (harmless — no one can authenticate as that userId). This is a known cleanup gap. 2. Re-onboard and claim again after erase
Onboarding mints a new userId, so you reach Profile → Claim as a fresh account. Outcome depends on whether step-1 deregister succeeded:

Deregister succeeded (the expected path): the username is free → claiming the same handle works → you own it again on a new account. Note your old data does not come back this way — this is a clean account that merely reuses the handle. Data only returns via a backup restore.
Deregister had failed (offline/worker error during erase): the handle is still bound to your dead old userId → claiming it returns 409 → "Already taken. If it's your own from another device, restore a backup to recover it — it can't be reclaimed here." You'd be stuck on that specific handle until you either restore a backup (brings back the old userId+keys, making re-claim work) or wait out the 365-day GC. A different handle claims fine immediately.
One distinction worth knowing: this deregister-on-erase only happens on the deliberate "Erase everything" button. The anti-theft PIN-failure wipe wipes locally but deliberately does not deregister (the person wiping might be a thief), so after that path the username stays claimed on the server and is only recoverable via backup or GC.

So on the happy path both your scenarios work cleanly. The one fragile spot is the silent deregister failure — which is exactly the recovery-hardening item from the plan (surface that failure + a restore-to-reclaim path). Want me to tackle that next, or verify the erase→reclaim loop live first?

---

=> So what I understand is that, if I reset the app now, the username still remains claimed in the server but when I onboard again, a new deviceId and userId will be generated for me which will be different than the current one?

New userId + new deviceId: yes, correct. Onboarding mints a fresh userId, and the next real claim generates a fresh deviceId. Both differ from your current ones.

Username "still remains claimed on the server": no — not on the normal erase path. The "Erase everything" button is specifically designed to release it. handleReset calls deregisterAccount() before wiping — a signed DELETE /account that tells the server to delete your user + devices, freeing the username. So on the happy path, after erase the username is available again, and re-onboarding + re-claiming the same handle works cleanly (as a brand-new account with new IDs).

The username only stays claimed in two cases:

The deregister call fails — offline, or the worker errors. It's best-effort and swallowed silently, so the handle gets orphaned to your dead old userId. Then re-claiming that same handle → 409 "Already taken," recoverable only via backup restore or the 365-day GC. (This silent-failure gap is exactly the F2 recovery-hardening item.)
Anti-theft PIN-failure wipe (not the erase button) — deliberately does not deregister, since the person wiping might be a thief.
So: new userId + new deviceId — yes; username released — yes, unless deregister failed.

Want me to verify this live? I could start the dev server, claim a handle, erase, and watch the actual DELETE /account request succeed (or not) in the network tab — that would confirm whether your deployed stack hits the happy path or the silent-failure gap.

---

=> I have onboarded with teh demo data and claimed hem2182 and created a Sharms's Family group. Now I have reset it with below commands in the console.

localStorage.clear();
indexedDB.deleteDatabase('penny');
window.location.reload();

Note that I did not do Erase All from the backup screen.
When re-onboarding, I filled the same details in Let us know you screen, the same username in the Username(optional) field.

The demo data seeded again. I see the clickable claim button on the Edit profile screen against teh username. However I don't see teh Sharma's Family group I earlier created.

What do you think will happen when I click on the Claim button.

From here onwards., dont make code changes until I say so. WE will discuss each thing, create an understanding, update the docs with that understanding and then probably take action.

Clicking Claim will fail with "Already taken"
Your manual console reset (indexedDB.deleteDatabase + localStorage.clear) is not the erase-all path — so deregisterAccount() never ran. That means on the server, hem2182 is still registered to your original userId.

When you click Claim now, claimAccount('hem2182') will:

Generate fresh device keys locally.
POST /register with your new userId + hem2182.
The worker checks (index.ts:96-97):

const holder = await userIdForUsername(env.DB, username);
if (holder !== null && holder !== userId) return 409; // username_taken
holder = your old userId; it's not null and not equal to your new userId → 409.
The client throws UsernameTakenError → Profile shows: "Already taken. If it's your own from another device, restore a backup to recover it — it can't be reclaimed here."
You'll stay unclaimed (the Claim button remains), and you can only move forward by claiming a different handle, or restoring a backup (which brings back the old userId + keys, making re-claim of hem2182 succeed because then holder === userId).

And "Sharma's Family" is gone locally — orphaned on the server
The group lived in the IndexedDB you deleted, so its local copy (the mirror + group keys) is gone. On the penny-groups server, the group + its members + encrypted events still exist, but they're tied to your old userId. Your new account is a different member as far as the server is concerned, so it can't see or decrypt it. Without a backup, that group and its data are effectively lost to you (any other members keep their own copies).

Why this is the important distinction
This is precisely the difference the doc's lifecycle table draws:

Erase-all button → deregisters first → username freed → clean reclaim.
Manual/devtools wipe (what you did) → no deregister → username orphaned to a dead userId → 409 on reclaim.
The manual wipe behaves like the anti-theft case: local data gone, server identity left dangling.

This is a genuinely useful scenario to capture — the doc currently covers erase-all and the PIN wipe, but not the "devtools/manual wipe" case you just hit, which is what a developer will actually do repeatedly during testing. Want me to add this as a distinct row in the account-lifecycle table + a Progress Log note (docs only, no code)?

---

=> Now here is the thing. I believe what we just did is a similar scenario of the user uninstalling the app and re-installing it later. Is that correct?

Why they're equivalent
The thing that matters isn't how the local data got wiped — it's that nothing told the server. Your devtools wipe and a normal uninstall are the same in the one way that counts:

Neither runs deregisterAccount(). There is no reliable "on uninstall" hook on the web platform — a PWA can't run code when the OS removes it. So DELETE /account only ever fires from the in-app "Erase everything" button, which a user uninstalling the app will never press.
Result in both cases: local data gone, but the server still holds hem2182 under the old userId. Reinstall → onboarding mints a new userId → Claim → 409 "Already taken." Identical to what you just saw.
So a plain uninstall → reinstall loses your handle and your groups unless you'd set up a backup. That's the real-user version of your test.

Two caveats worth knowing
Uninstall doesn't always clear storage. Your devtools command is the guaranteed-clean case. Some platforms (notably desktop PWAs) may leave the origin's IndexedDB/localStorage behind after "uninstall," in which case reopening still finds you fully claimed with groups intact. Mobile uninstall usually does clear it. So uninstall is sometimes equivalent, sometimes not — your devtools wipe is the worst case, always.

iOS is worse than uninstall. Safari/iOS caps script-writable storage for standalone web apps and can evict a PWA's IndexedDB after ~7 days of non-use — with no uninstall and no user action at all. So an iOS user who just doesn't open Penny for a week can land in exactly this orphaned state involuntarily.

The takeaway
This elevates recovery from "nice to have" to essential, because the most common, zero-friction user actions (uninstall/reinstall, or simply not opening the app on iOS) drop the user into the orphaned-handle state, and the only path that cleans up server-side (Erase everything) is one they'll rarely take. The robust answers are all in Track F's scope:

Backup + restore (Flow 3) — restores the old userId+keys, so reclaim becomes idempotent and groups come back.
Device pairing (Flow 2) — bootstrap identity onto the reinstalled app from another device.
Proof-based reclaim — recognize an "orphaned-but-yours" handle and guide into restore/pairing instead of "taken."
Want me to log this — an "Uninstall / reinstall (and iOS 7-day eviction)" note in the doc tying it to the manual-wipe row, plus a Progress Log entry — and I'd also suggest bumping recovery (F2/F3) up in priority given it's a normal-user path, not an edge case?

---

=> Yes I agree, reacovery is essential. This is why we have made it mandatory to make backup on Drive/ICloud mandatory and is also automatic. The backup will be made everyday when user opens the app.

Now what I think here is that this is a real gap. First I think We should make the username mandatory in the onboarding. Also I think that, the user id gets created everytime with the scenario we talked. If user also installs the app on another device, the user id is created different there. Restore backup will restore the same user id on both the devices for the same user.

user will never be able to re-claim the same username.

I think user should be identified with the username. This would help in this scenario. The user clicks on claim, it reclaims the username for that user and syncs the server stored data. I have not thought it fully. What do you think will be the implecations of identifying a user uniquely with username?

Verified the crux: the backup bundle does include security, profile, device_keys, and group_keys (backupManager.ts:29-49), and importBackup restores all of them. So restoring genuinely re-establishes the same userId + keys + DMK + group keys. That fact changes the answer to your question.

The key realization first
To get your groups and data back, you must recover the same userId — and only the backup carries it. A username can never carry your data. Group membership and key-grants are keyed by userId; your data is encrypted under a DMK that only your passphrase-wrapped blob (in the backup) can unlock. So even a perfect "reclaim by username" that hands you the handle on a new userId gives you an empty account with a familiar name — no groups, no data. The username is a label; the backup is the account.

That means the recovery you want is already latent in the mandatory Drive/iCloud backup you built. The missing piece isn't "identify by username" — it's "on reinstall, restore the backup" (which brings back the old userId, at which point reclaiming hem2182 is idempotent because holder === userId).

Implications of identifying a user uniquely by username
You asked directly, so here's the honest list:

It needs proof of ownership, or it's account takeover. If clicking "Claim" reclaims a username, what stops me from typing hem2182 and becoming you? Nothing — unless the username is bound to a secret only you hold. That secret would be your passphrase. So "identify by username" really means introducing username+password login — the exact thing Penny deliberately avoided ("the username isn't a login").

The passphrase becomes the true credential and a hard lockout risk. If username = account and passphrase = key, then forgetting the passphrase = permanently locked out of your handle, and the server can't reset it (it's E2EE). Today, a forgotten passphrase just means you start fresh with a new handle.

The server must store more → cost + a bigger breach target. At minimum a passphrase verifier; for data-sync, your encrypted data too. That reintroduces exactly the server-storage question we sidestepped with Drive, and a DB leak now enables offline brute-force against weak passphrases. Model B's "a breach reveals ~nothing" weakens.

Groups still break unless you recover the old userId. If the username is re-pointed to a new userId on reclaim, every group sees you as a stranger with no keys. To keep groups you must restore the old userId — which loops right back to needing the backup. So username-as-identity doesn't actually save your groups on its own.

Renames become account migrations, and you invite squatting/enumeration. Username becomes load-bearing, so changing it = migrating an account, and "does @x exist?" becomes an attack surface.

What I'd recommend
Two coherent directions — I favor the first:

(A) Keep Model B; make reinstall restore (recommended, minimal). On a fresh install, detect the user's Drive/iCloud backup → offer/auto restore → same userId + keys + DMK + data + group keys all return → reclaiming the handle is idempotent → your groups reappear. The bundle already carries everything (verified above). Work: a "been here before? restore your account" onboarding branch + making reclaim idempotent after restore. This is the natural payoff of the mandatory backup you already built. (Caveat: a restored device is an identity clone — same deviceId — which is fine for recovery; distinct multi-device is what pairing/F3 adds.)

(B) Server-side E2EE identity blob keyed by username+passphrase (bigger, optional). For users who lose Drive access, the server stores the passphrase-wrapped DMK (+ maybe encrypted data); reclaim proves the passphrase (SRP/verifier) and gets the blob back. This is a real login layered on E2EE — more crypto, storage cost, and a breach surface. It largely duplicates the Drive backup, but works independent of the user's cloud.

Making username mandatory at onboarding is reasonable and complements (A) — everyone gets a handle, and with backup everyone's identity is recoverable — but understand it doesn't fix recovery by itself; the restore does.

My bottom line: you don't need to make the username the identity to solve this. You need reinstall to restore the backup. Username stays a label; passphrase + backup is the real, recoverable account — and it stays end-to-end encrypted and free-tier.

Want me to log this analysis into the doc (the "username can't carry data" principle, the implications list, and the A-vs-B decision framing), and note that F2 should center on restore-on-reinstall?

---

=> So I agree with asking to restore from a backup during the onboarding flow. this is what whatsapp does right now upon login with phone number.
Now whatsApp is switching to username as well so that phone number can be private and username is the true unique handle for users. WhatsApp also has chat groups with can have multiple members. If they can do it. why we cant.

Why I asked this is because, if I dont have a backup to restore in the onboarding flow then on reinstall of the app, even though I have the username already in the server, I cannot reclaim it. I understand the someone can misuse it. But's shouldn't whatsapp will face the same problem.

Also What's app lets users to link devices using a QR code or phone number currebtly which will becone username handle soon so that you can open your what's on laptop as well.

I could be possible that I was using penny only for the Groups and no personal transactions so no backup.

You're pushing on exactly the right spot, and the WhatsApp analogy is a good one — but there's one specific thing WhatsApp has that Penny deliberately gave up, and naming it answers your whole question.

What makes WhatsApp's reclaim work: a verified side-channel
WhatsApp can let you reclaim your handle on a fresh install because it can prove you own it — you receive an SMS OTP on your phone number. Anyone can type your number/username, but only you can receive the code. That OTP is the anti-takeover mechanism. The username becoming the public handle doesn't change this — there's still a phone number (or passkey/email) underneath doing the proving.

Penny, by deliberate decision, has no phone, no OTP, no email — so today it has no side-channel to prove you own a handle. That's the entire reason username-alone reclaim would be takeover here but isn't on WhatsApp. So the real question isn't "why can't we identify by username" — it's "what is Penny's proof of ownership?"

Penny's Model-B-friendly proof: username + passphrase (server-verified)
We don't need phone/OTP. The passphrase you already have can be the proof, verified server-side without the server ever seeing it or your data (an SRP-style verifier — the same idea as Signal's PIN or WhatsApp's own "encryption password" for backups). This is precisely the "server auth (later)" that was always in the plan — not the rejected phone/OTP.

With that one addition, your exact scenario works:

Reinstall → enter username + passphrase → server verifies → recovers your old userId and registers this new device under it → you rejoin your groups (the server knew your membership) → an admin device re-grants the group keys → you're back.

No personal-data backup required — which is your "I only used Penny for Groups" case. This is genuine WhatsApp parity.

The two honest costs (WhatsApp pays these too)
The passphrase becomes your recovery credential. Forget it → locked out of the handle (server can't reset E2EE). The server stores a verifier → a brute-force surface, mitigated by SRP + strong KDF + rate-limiting. WhatsApp's encryption-password / Signal's PIN make the identical trade.
Group history is end-to-end encrypted. Reclaiming identity re-associates you with the group, but decrypting old messages needs either your backup or a re-grant from another member who still holds the key. New activity flows fine. If you were the sole key-holder with no backup, that history is genuinely gone — WhatsApp has the exact same limitation (that's why they nag about backups).
Device linking (QR / "Penny on laptop")
That's device pairing (Track F3) — an already-authenticated device approves a new one by QR. Same feature as WhatsApp Web. WhatsApp's upcoming "link by username" still requires the primary device (or OTP) to approve; it's not username-alone either.

So the reframed recovery model — three modes, one shared mechanism
Restore-on-reinstall — fast path for users with a backup (identity + data + group keys all return).
Username + passphrase reclaim — for users without a backup (your groups-only case). The WhatsApp-parity piece; needs the server-auth layer.
Device pairing (QR) — multi-device + laptop.
All three reuse the same ECDH key-grant machinery groups already have.

My take: you're right, and we can do what WhatsApp does — the missing ingredient is a proof of ownership, and the Model-B-clean one is server-verified username+passphrase (not phone/OTP). Make username mandatory (agreed), add restore-on-reinstall, and add the passphrase-reclaim layer — that's what actually closes your gap.

Want me to log all of this — the WhatsApp comparison, the "proof of ownership is the real requirement" principle, the username+passphrase reclaim design, and the E2EE-group-history limit — and restructure the Track F plan around these three recovery modes?

---

=> So What I understand is that we can do SRP style verifier to identify users with username(always unique). This also handles the proof of ownership that we did not have till now. The backup is mandatory and restore during onboarding can restore user personal data and other things as well. But if no backup, with the SRP style verifier, we can restore the user and its groups and all its data.

So in short we would not need the userId anymore. Is that correct? You mentioned this for groups data "ecrypting old messages needs either your backup or a re-grant from another member who still holds the key. New activity flows fine. " Wil this not be solved by SRP style verifier for all users?

You've got the authentication half exactly right. But there's one distinction that's the crux of the whole model, and it's where the reasoning slips: SRP proves who you are; it does not recover encryption keys. Authentication and decryption are different problems, and E2EE means the server can only ever help with the first.

Let me take your two questions in turn.

"We wouldn't need the userId anymore" — not quite
Keep a stable internal userId as the real primary key; the username is a unique, mutable public handle that maps to it. Reasons:

Usernames can be renamed. If username is the key, a rename breaks every reference (group memberships, key-grants, who-authored-which-event). A stable userId under the hood means rename is just relabeling.
Even WhatsApp keeps an internal account id; the phone/username is a lookup handle, not the primary key.
What actually changes: today the userId is minted fresh on every install and lost forever without a backup. With SRP, username + passphrase recovers your existing userId (server looks up username → userId, verifies the passphrase, binds your new device under the same userId). So the userId doesn't disappear — it stops being disposable. Functionally you're "identified by username"; the userId is just recoverable plumbing.

"Won't SRP solve group history for all users?" — no, and this is the important part
Think of two separate locks:

Authentication — "prove you're hem2182." ✅ SRP solves this with username + passphrase.
Decryption — "can you actually read the ciphertext?" ❌ SRP does nothing here. Reading data needs the key, and in Model B the server never has the key — it only holds ciphertext it can't read.
Group history is encrypted with the Group Key (a random AES key, not derived from your passphrase, never sent to the server). After a perfect SRP login, the server can re-associate you with your groups — but it cannot hand you the Group Key it never had. The key lives only: in your backup, or on other members' devices.

So group history comes back one of two ways, neither of which is SRP:

Re-grant from a co-member — another member's device re-wraps the Group Key to your new device (the ECDH grant machinery). Since a group has multiple members by definition, there's almost always someone who still holds the key → history usually is recoverable this way. Automatic-ish after you rejoin.
Your backup — if you had one.
The only truly unrecoverable case: you're the sole remaining key-holder and no backup. Then the ciphertext is permanently dead. WhatsApp has this exact limitation — OTP rejoins your groups, but old messages come back only from your Drive/iCloud backup, never from WhatsApp's server. Auth can't conjure a key.

And personal data is worse, because there's no co-holder
Your personal data is encrypted under the DMK — a random key that only your passphrase wraps (it's never derived from the passphrase; that's the envelope design). On a no-backup reinstall, the wrapped-DMK blob was local and got wiped. So:

SRP proves you're you. But the DMK is gone, and unlike a Group Key, no one else holds it — personal data has no co-members to re-grant it.
Therefore personal data with no backup is unrecoverable, even with SRP. Only your backup can bring it back.
So what would it take to "restore all data from just username + passphrase"?
That specific outcome requires the server to store your encrypted DMK and your encrypted personal data (keyed to your account). Then SRP login → server returns the encrypted blob → passphrase unwraps it → everything back, no user's-own-cloud needed. It's still E2EE (server can't read it).

But that's a real, separate decision: it reverses the "your data lives on your own Drive" Model B choice and reopens the personal-data storage-cost / free-tier question we closed by dropping R2. It's essentially building WhatsApp's cloud backup into Penny's servers. Legitimate, but it has cost and a (ciphertext-only) breach surface — not something SRP gives you for free.

Net
SRP buys you: proof of ownership → identity + group membership recovery from just username + passphrase. Real WhatsApp parity for "get back in and rejoin your groups." This closes your core gap.
SRP does not buy you: decryption. Group history still needs a co-member re-grant (usually available) or backup; personal data still needs backup — unless we separately choose to store an encrypted DMK+data blob on the server (the bigger, costed decision).
userId stays as the internal anchor; username becomes the recoverable public handle.
This is inherent to end-to-end encryption, not a hole we can patch: the server can authenticate you all day, but it can't decrypt what it was designed never to read.

Want me to log this — the auth-vs-decryption distinction, userId-as-internal-anchor, the three recovery surfaces (re-grant / backup / optional server-side E2EE blob), and the WhatsApp parity/limits — into the Track F doc?
