import { useEffect, useRef, useState } from "react";
import { Link, useLocation } from "wouter";
import { trpc } from "@/lib/trpc";
import { useAuth } from "@/_core/hooks/useAuth";
import { SiteHeader, SiteFooter } from "@/components/SiteChrome";
import { EmailChangeForm } from "@/components/EmailChangeForm";
import { mediaUrl } from "@/lib/storage";
import { ContactVerification } from "@/components/ContactVerification";

export default function UserProfile() {
  const { user, loading } = useAuth();
  const [, navigate] = useLocation();
  const utils = trpc.useUtils();
  const initialized = useRef<number | null>(null);
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [password, setPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [message, setMessage] = useState("");
  const [fileError, setFileError] = useState("");
  const [uploading, setUploading] = useState(false);
  useEffect(() => {
    if (!user || initialized.current === user.id) return;
    const parts = (user.name || "").split(" ");
    setFirstName(user.firstName || parts[0] || "");
    setLastName(user.lastName || parts.slice(1).join(" ") || "");
    initialized.current = user.id;
  }, [user]);
  const update = trpc.auth.updateProfile.useMutation({ onSuccess: () => {
    setMessage("Profile saved."); utils.auth.me.invalidate();
  } });
  const upload = trpc.auth.uploadAvatar.useMutation({ onSuccess: () => {
    setMessage("Avatar updated."); utils.auth.me.invalidate();
  } });
  const signInAgain = () => { utils.auth.me.setData(undefined, null); utils.invalidate(); navigate("/login"); };
  const changePassword = trpc.auth.changePassword.useMutation({ onSuccess: signInAgain });
  const failure = fileError || update.error?.message || upload.error?.message || changePassword.error?.message;
  const field = "w-full border border-[#d9d0c4] rounded p-3 bg-[#faf6f0]";
  return <div className="min-h-screen bg-[#f0e8dc]"><SiteHeader /><main className="max-w-2xl mx-auto p-6 my-8 bg-white space-y-6">
    <h1 className="font-serif text-4xl">Account settings</h1>
    {loading ? <p>Loading account...</p> : !user ? <Link href="/login?next=%2Fprofile" className="underline">Sign in to edit your profile</Link> : <>
      <div className="flex items-center gap-5">
        {user.avatarUrl ? <img src={mediaUrl(user.avatarUrl)} alt="Your avatar" className="w-20 h-20 rounded-full object-cover" /> :
          <span className="w-20 h-20 rounded-full brand-gradient text-white grid place-items-center text-2xl">{(user.name || "U").slice(0, 1).toUpperCase()}</span>}
        <p>{user.email}<br />{user.role}</p>
      </div>
      <form className="space-y-4" onSubmit={event => { event.preventDefault(); update.mutate({ firstName, lastName }); }}>
        <label className="block">First name<input className={field} required maxLength={100} autoComplete="given-name" value={firstName} onChange={event => setFirstName(event.target.value)} /></label>
        <label className="block">Last name<input className={field} required maxLength={100} autoComplete="family-name" value={lastName} onChange={event => setLastName(event.target.value)} /></label>
        <button className="brand-button" disabled={update.isPending}>Save profile</button>
      </form>
      <section className="space-y-3 border-t pt-5">
        <h2 className="font-serif text-2xl">Avatar</h2>
        <p className="text-sm">JPEG, PNG or WebP up to 2 MB. Images are centre-cropped to 256 x 256 and metadata is removed.</p>
        <label className="block">Upload / replace avatar<input type="file" accept="image/jpeg,image/png,image/webp" disabled={uploading || upload.isPending || update.isPending} onChange={async event => {
          const file = event.target.files?.[0]; event.target.value = ""; setFileError("");
          if (!file) return;
          if (file.size > 2 * 1024 * 1024) { setFileError("Choose an image no larger than 2 MB."); return; }
          setUploading(true);
          try {
            const fileBase64 = await new Promise<string>((resolve, reject) => {
              const reader = new FileReader();
              reader.onload = () => resolve(String(reader.result).split(",")[1]);
              reader.onerror = () => reject(new Error("Could not read the image."));
              reader.readAsDataURL(file);
            });
            await upload.mutateAsync({ fileBase64 });
          } catch (error) { setFileError(error instanceof Error ? error.message : "Avatar upload failed."); }
          finally { setUploading(false); }
        }} /></label>
        {user.avatarUrl && <button type="button" className="underline" disabled={uploading || upload.isPending || update.isPending} onClick={() => update.mutate({ avatarUrl: null })}>Remove avatar</button>}
      </section>
      <ContactVerification showPhone={user.signupIntent === "vendor" || user.role === "vendor"} />
      <EmailChangeForm />
      <form className="space-y-4 border-t pt-5" onSubmit={event => {
        event.preventDefault(); setFileError("");
        if (newPassword !== confirmPassword) { setFileError("Passwords must match."); return; }
        changePassword.mutate({ currentPassword: password, newPassword });
      }}>
        <h2 className="font-serif text-2xl">Change password</h2>
        <label className="block">Current password<input className={field} type="password" autoComplete="current-password" required value={password} onChange={event => setPassword(event.target.value)} /></label>
        <label className="block">New password<input className={field} type="password" autoComplete="new-password" required minLength={8} value={newPassword} onChange={event => setNewPassword(event.target.value)} /></label>
        <label className="block">Confirm new password<input className={field} type="password" autoComplete="new-password" required value={confirmPassword} onChange={event => setConfirmPassword(event.target.value)} /></label>
        <button className="brand-button" disabled={changePassword.isPending}>Change password and sign out</button>
      </form>
      <Link href="/account" className="underline">Back to your account</Link>
    </>}
    {failure && <p role="alert" className="form-error">{failure}</p>}
    {message && <p role="status">{message}</p>}
  </main><SiteFooter /></div>;
}
