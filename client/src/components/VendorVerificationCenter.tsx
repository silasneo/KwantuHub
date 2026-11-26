import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { CollectionPager } from "@/components/CollectionPager";
import {
  NORTH_AMERICA_COUNTRIES,
  type NorthAmericaCountry,
} from "@shared/types";

export function VendorVerificationCenter() {
  const utils = trpc.useUtils();
  const [page, setPage] = useState(1);
  const {
    data: statusData,
    isLoading,
    error: statusError,
    refetch,
  } = trpc.vendor.verificationStatus.useQuery({ page });

  const [sessionType, setSessionType] = useState<
    | "identity_document"
    | "liveness"
    | "proof_of_residence"
    | "combined_na_vendor"
  >("proof_of_residence");
  const [countryCode, setCountryCode] = useState<NorthAmericaCountry>("US");
  const [provider, setProvider] = useState<"didit" | "manual">("manual");
  const [consentGiven, setConsentGiven] = useState(false);
  const [manualFile, setManualFile] = useState<File | null>(null);
  const [fileError, setFileError] = useState("");
  const [evidenceType, setEvidenceType] = useState<
    | "government_id"
    | "utility_bill"
    | "bank_statement"
    | "lease_agreement"
    | "business_registration"
  >("utility_bill");
  const [selectedSessionId, setSelectedSessionId] = useState<number | null>(
    null
  );

  const startSessionMutation = trpc.vendor.startVerificationSession.useMutation(
    {
      onSuccess: result => {
        setPage(1);
        utils.vendor.verificationStatus.invalidate();
        if (result.verificationUrl) {
          window.open(result.verificationUrl, "_blank", "noopener,noreferrer");
        }
      },
    }
  );

  const submitEvidenceMutation = trpc.vendor.submitManualEvidence.useMutation({
    onSuccess: () => {
      utils.vendor.verificationStatus.invalidate();
      setManualFile(null);
    },
  });

  if (isLoading) {
    return (
      <div className="p-6 bg-white border border-[#d9d0c4] rounded animate-pulse">
        <div className="h-4 bg-[#f0e8dc] w-1/3 mb-4 rounded"></div>
        <div className="h-10 bg-[#f0e8dc] w-full rounded"></div>
      </div>
    );
  }

  const profile = statusData?.profile;
  const badges = statusData?.badges;
  const sessions = statusData?.sessions || [];

  return (
    <div className="bg-white border border-[#d9d0c4] p-6 rounded space-y-6">
      {statusError && (
        <div role="alert" className="form-error">
          <p>{statusError.message}</p>
          <button className="underline" onClick={() => refetch()}>
            Retry verification status
          </button>
        </div>
      )}
      <div>
        <h3 className="font-serif font-bold text-xl text-[#0a0a0a] mb-1">
          Vendor Identity & North America Residence Verification
        </h3>
        <p className="text-xs text-[#68635c] font-serif">
          Verify your government-issued identity and residence in the US,
          Canada, or Mexico to qualify for certified vendor badges.
        </p>
      </div>

      {/* Badge status overview */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <div className="p-3 bg-[#faf6f0] border border-[#eee8df] rounded text-center">
          <p className="text-[10px] font-bold uppercase tracking-wider text-[#68635c]">
            Contact Verified
          </p>
          <p
            className={`text-xs font-bold mt-1 ${badges?.contactVerified ? "text-emerald-700" : "text-[#8c827a]"}`}
          >
            {badges?.contactVerified ? "Verified" : "Pending Phone/Email"}
          </p>
        </div>
        <div className="p-3 bg-[#faf6f0] border border-[#eee8df] rounded text-center">
          <p className="text-[10px] font-bold uppercase tracking-wider text-[#68635c]">
            Identity Verified
          </p>
          <p
            className={`text-xs font-bold mt-1 ${badges?.identityVerified ? "text-emerald-700" : "text-[#8c827a]"}`}
          >
            {profile?.identityStatus?.toUpperCase() || "UNVERIFIED"}
          </p>
        </div>
        <div className="p-3 bg-[#faf6f0] border border-[#eee8df] rounded text-center">
          <p className="text-[10px] font-bold uppercase tracking-wider text-[#68635c]">
            NA Residence
          </p>
          <p
            className={`text-xs font-bold mt-1 ${badges?.residenceVerified ? "text-emerald-700" : "text-[#8c827a]"}`}
          >
            {badges?.residenceVerified
              ? `${badges.countryCode} Verified`
              : profile?.residenceStatus?.toUpperCase() || "UNVERIFIED"}
          </p>
        </div>
        <div className="p-3 bg-[#faf6f0] border border-[#eee8df] rounded text-center">
          <p className="text-[10px] font-bold uppercase tracking-wider text-[#68635c]">
            Kwantu Approved
          </p>
          <p
            className={`text-xs font-bold mt-1 ${badges?.kwantuApproved ? "text-emerald-700" : "text-[#8c827a]"}`}
          >
            {profile?.approvalStatus?.toUpperCase() || "PENDING"}
          </p>
        </div>
      </div>

      {/* Start Session Form */}
      <div className="border-t border-[#eee8df] pt-5 space-y-4">
        <h4 className="text-xs font-bold uppercase tracking-wider text-[#0a0a0a]">
          Start Verification Session
        </h4>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label className="text-[11px] font-bold uppercase tracking-wider text-[#68635c] block mb-1">
              Verification Method
            </label>
            <select
              value={provider}
              onChange={e => setProvider(e.target.value as typeof provider)}
              className="w-full text-xs border border-[#d9d0c4] rounded px-3 py-2 bg-[#faf6f0]"
            >
              <option value="didit">Didit Hosted KYC (ID + Liveness)</option>
              <option value="manual">
                Private Documents (Administrator Review Required)
              </option>
            </select>
          </div>
          <div>
            <label className="text-[11px] font-bold uppercase tracking-wider text-[#68635c] block mb-1">
              Verification Check
            </label>
            <select
              value={sessionType}
              onChange={e =>
                setSessionType(e.target.value as typeof sessionType)
              }
              className="w-full text-xs border border-[#d9d0c4] rounded px-3 py-2 bg-[#faf6f0]"
            >
              <option value="combined_na_vendor">
                Combined NA Vendor (Identity + Residence)
              </option>
              <option value="identity_document">Government ID Document</option>
              <option value="proof_of_residence">
                Proof of Residence (Address/Utility)
              </option>
              <option value="liveness" disabled={provider === "manual"}>
                Liveness / Face Match (Hosted Only)
              </option>
            </select>
          </div>
          <p className="text-xs text-[#68635c]">
            Account identity is established through Didit onboarding, not manual
            approval. Residence needs a utility bill, bank statement or
            residential lease; a business registration alone is insufficient.
            Combined manual checks require both government ID and residence
            documents. Up to 10 documents can be added while a manual session is
            open.
          </p>
          <div>
            <label className="text-[11px] font-bold uppercase tracking-wider text-[#68635c] block mb-1">
              Residence Country (North America)
            </label>
            <select
              value={countryCode}
              onChange={e =>
                setCountryCode(e.target.value as NorthAmericaCountry)
              }
              className="w-full text-xs border border-[#d9d0c4] rounded px-3 py-2 bg-[#faf6f0]"
            >
              <option value="US">United States (US)</option>
              <option value="CA">Canada (CA)</option>
              <option value="MX">Mexico (MX)</option>
            </select>
          </div>
        </div>

        <div className="flex items-start gap-2 pt-2">
          <input
            type="checkbox"
            id="vendorConsent"
            checked={consentGiven}
            onChange={e => setConsentGiven(e.target.checked)}
            className="mt-1"
          />
          <label
            htmlFor="vendorConsent"
            className="text-xs text-[#68635c] font-serif cursor-pointer"
          >
            I consent to KwantuHub processing my identity and address
            documentation through the selected verification provider and
            authorized manual review solely to verify my diaspora vendor
            eligibility and maintain trust badges.
          </label>
        </div>

        {startSessionMutation.error && (
          <p className="text-xs text-red-700">
            {startSessionMutation.error.message}
          </p>
        )}

        <button
          onClick={() => {
            startSessionMutation.mutate({
              sessionType,
              countryCode,
              provider,
              consentGiven,
            });
          }}
          disabled={!consentGiven || startSessionMutation.isPending}
          className="text-xs font-bold uppercase tracking-wider text-white brand-gradient px-4 py-2.5 rounded disabled:opacity-50 cursor-pointer"
        >
          {startSessionMutation.isPending
            ? "Starting..."
            : "Begin Verification Session"}
        </button>
      </div>

      {/* Active or past verification sessions */}
      <CollectionPager pagination={statusData?.pagination} onPage={value => { setSelectedSessionId(null); setPage(value); }} label="Verification sessions" />
      {sessions.length > 0 && (
        <div className="border-t border-[#eee8df] pt-5 space-y-3">
          <h4 className="text-xs font-bold uppercase tracking-wider text-[#0a0a0a]">
            Your Verification Sessions
          </h4>
          <div className="space-y-2">
            {sessions.map(s => (
              <div
                key={s.id}
                className="p-3 border border-[#eee8df] bg-[#faf6f0] rounded flex flex-col md:flex-row md:items-center justify-between gap-2 text-xs"
              >
                <div>
                  <span className="font-bold text-[#0a0a0a] uppercase">
                    {s.sessionType.replace(/_/g, " ")}
                  </span>
                  <span className="text-[#68635c] ml-2">
                    ({s.provider.toUpperCase()} · {s.countryCode || "NA"})
                  </span>
                  <span className="block text-[11px] text-[#8c827a] mt-0.5">
                    Started {new Date(s.createdAt).toLocaleDateString()} ·
                    Status:{" "}
                    <strong className="text-[#0a0a0a] uppercase">
                      {s.status}
                    </strong>
                  </span>
                  {s.declinedReason && (
                    <p className="mt-1 text-red-700">
                      Decision: {s.declinedReason}
                    </p>
                  )}
                  {(s.status === "declined" ||
                    Boolean(
                      s.expiresAt && new Date(s.expiresAt) <= new Date()
                    )) && (
                    <p className="mt-1">
                      Start a new session above and submit corrected documents;
                      previous decisions remain in history.
                    </p>
                  )}
                </div>
                {s.canUpload && (
                  <button
                    onClick={() => setSelectedSessionId(s.id)}
                    className="text-[11px] font-bold uppercase tracking-wider text-[#d71466] border border-[#d71466] px-3 py-1 rounded hover:bg-[#d71466]/5"
                  >
                    Submit Supporting Document
                  </button>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Manual document submission fallback */}
      {selectedSessionId && (
        <div className="border-t border-[#eee8df] pt-4 p-4 bg-[#faf6f0] rounded space-y-3">
          <h5 className="text-xs font-bold uppercase tracking-wider text-[#0a0a0a]">
            Submit Supporting Document (Session #{selectedSessionId})
          </h5>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <div>
              <label className="text-[11px] font-bold uppercase tracking-wider text-[#68635c] block mb-1">
                Document Type
              </label>
              <select
                value={evidenceType}
                onChange={e =>
                  setEvidenceType(e.target.value as typeof evidenceType)
                }
                className="w-full text-xs border border-[#d9d0c4] rounded px-3 py-2 bg-white"
              >
                <option value="utility_bill">
                  Utility Bill (Electric, Gas, Water)
                </option>
                <option value="bank_statement">Bank / Card Statement</option>
                <option value="lease_agreement">
                  Residential Lease / Rental Agreement
                </option>
                <option value="business_registration">
                  Business License / Registration
                </option>
                <option value="government_id">
                  Driver's License / National ID / Passport
                </option>
              </select>
            </div>
            <div>
              <label className="text-[11px] font-bold uppercase tracking-wider text-[#68635c] block mb-1">
                Upload File (PDF, PNG, JPG)
              </label>
              <input
                type="file"
                accept=".pdf,.png,.jpg,.jpeg"
                onChange={e => {
                  const selected = e.target.files?.[0] || null;
                  setFileError(
                    selected && selected.size > 5 * 1024 * 1024
                      ? "Choose a document no larger than 5 MB."
                      : ""
                  );
                  setManualFile(
                    selected && selected.size <= 5 * 1024 * 1024
                      ? selected
                      : null
                  );
                }}
                className="w-full text-xs"
              />
            </div>
          </div>
          {fileError && <p className="text-xs text-red-700">{fileError}</p>}
          {submitEvidenceMutation.error && (
            <p role="alert" className="form-error">
              {submitEvidenceMutation.error.message} Check your file and retry.
            </p>
          )}
          {submitEvidenceMutation.isSuccess && (
            <p role="status" className="text-sm">
              Supporting document submitted for review.
            </p>
          )}
          <div className="flex gap-2">
            <button
              onClick={async () => {
                if (!manualFile) return;
                const reader = new FileReader();
                reader.onerror = () =>
                  setFileError(
                    "Could not read this document. Choose it again and retry."
                  );
                reader.onload = () => {
                  const base64 = (reader.result as string).split(",")[1];
                  submitEvidenceMutation.mutate({
                    sessionId: selectedSessionId,
                    evidenceType,
                    fileBase64: base64,
                    filename: manualFile.name,
                  });
                };
                reader.readAsDataURL(manualFile);
              }}
              disabled={
                !manualFile ||
                submitEvidenceMutation.isPending ||
                !sessions.some(
                  session =>
                    session.id === selectedSessionId && session.canUpload
                )
              }
              className="text-xs font-bold uppercase tracking-wider text-white bg-[#0a0a0a] px-4 py-2 rounded disabled:opacity-50"
            >
              {submitEvidenceMutation.isPending
                ? "Submitting..."
                : "Submit for Verification"}
            </button>
            <button
              onClick={() => setSelectedSessionId(null)}
              className="text-xs text-[#68635c] px-3 py-2"
            >
              Cancel
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
