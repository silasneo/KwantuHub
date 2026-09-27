import { useState } from "react";
import { Link } from "wouter";
import { trpc } from "@/lib/trpc";
import { useAuth } from "@/_core/hooks/useAuth";
import { SiteHeader, SiteFooter } from "@/components/SiteChrome";

export default function UserProfile() {
  const { user, isAuthenticated } = useAuth();
  const utils = trpc.useUtils();

  const [name, setName] = useState(user?.name || "");
  const [avatarUrl, setAvatarUrl] = useState(user?.avatarUrl || "");
  const [success, setSuccess] = useState(false);

  const updateMutation = trpc.auth.updateProfile.useMutation({
    onSuccess: () => {
      setSuccess(true);
      utils.auth.me.invalidate();
      setTimeout(() => setSuccess(false), 3000);
    },
  });

  if (!isAuthenticated) {
    return (
      <div className="min-h-screen bg-[#f0e8dc] flex flex-col">
        <SiteHeader />
        <main className="flex-1 max-w-4xl mx-auto px-4 py-20 text-center">
          <h2 className="text-3xl font-serif font-bold text-[#0a0a0a] mb-4">
            Please Sign In
          </h2>
          <Link
            href="/login"
            className="text-xs font-bold uppercase tracking-wider text-white brand-gradient px-6 py-3 rounded"
          >
            Sign In with JWT Credentials
          </Link>
        </main>
        <SiteFooter />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#f0e8dc] flex flex-col">
      <SiteHeader />

      <main className="flex-1 max-w-2xl mx-auto px-4 py-16 w-full">
        <span className="text-xs font-bold uppercase tracking-widest text-[#d71466] block mb-2">
          ACCOUNT SETTINGS
        </span>
        <h1 className="text-4xl sm:text-5xl font-serif font-bold text-[#0a0a0a] mb-8">
          Your community <span className="italic font-normal">profile.</span>
        </h1>

        <div className="bg-white border border-[#d9d0c4] p-8 rounded shadow-xs">
          {/* Avatar preview */}
          <div className="flex items-center gap-6 mb-8 pb-8 border-b border-[#eee8df]">
            {avatarUrl ? (
              <img
                src={avatarUrl}
                alt={name || "Avatar"}
                className="w-20 h-20 rounded-full border-2 border-[#d9d0c4] object-cover"
              />
            ) : (
              <div className="w-20 h-20 rounded-full brand-gradient text-white flex items-center justify-center font-serif font-bold text-2xl">
                {name ? name[0].toUpperCase() : "U"}
              </div>
            )}
            <div>
              <h3 className="font-serif font-bold text-2xl text-[#0a0a0a]">
                {user?.name}
              </h3>
              <p className="text-xs text-[#68635c]">{user?.email}</p>
              <span className="inline-block mt-2 text-[10px] font-bold uppercase tracking-wider bg-[#faf6f0] text-[#0a0a0a] px-2.5 py-0.5 rounded">
                Role: {user?.role}
              </span>
            </div>
          </div>

          {success && (
            <div className="bg-green-50 border border-green-200 text-green-800 p-4 rounded text-xs mb-6">
              Profile updated successfully!
            </div>
          )}

          <div className="space-y-5">
            <div>
              <label className="text-xs font-bold uppercase tracking-wider text-[#68635c] block mb-1">
                Full Name
              </label>
              <input
                type="text"
                value={name}
                onChange={e => setName(e.target.value)}
                className="w-full text-sm border border-[#d9d0c4] rounded px-3 py-2 bg-[#faf6f0]"
              />
            </div>

            <div>
              <label className="text-xs font-bold uppercase tracking-wider text-[#68635c] block mb-1">
                Avatar Image URL
              </label>
              <input
                type="url"
                value={avatarUrl}
                onChange={e => setAvatarUrl(e.target.value)}
                placeholder="https://..."
                className="w-full text-sm border border-[#d9d0c4] rounded px-3 py-2 bg-[#faf6f0]"
              />
              <span className="text-[11px] text-[#888] block mt-1">
                Provide an image link or leave empty to use your default
                initials avatar.
              </span>
            </div>

            <div className="pt-4 border-t border-[#eee8df] flex justify-between items-center">
              <Link
                href="/account"
                className="text-xs text-[#68635c] hover:underline"
              >
                ← Back to Saved & Inquiries
              </Link>
              <button
                onClick={() =>
                  updateMutation.mutate({
                    name,
                    avatarUrl: avatarUrl || undefined,
                  })
                }
                disabled={updateMutation.isPending}
                className="text-xs font-bold uppercase tracking-wider text-white brand-gradient px-6 py-2.5 rounded disabled:opacity-50 cursor-pointer"
              >
                {updateMutation.isPending ? "Saving..." : "Save Changes"}
              </button>
            </div>
          </div>
        </div>
      </main>

      <SiteFooter />
    </div>
  );
}
