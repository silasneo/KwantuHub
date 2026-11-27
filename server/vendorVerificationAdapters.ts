import { ENV } from "./_core/env";
import { randomUUID } from "node:crypto";
import isoCountries from "i18n-iso-countries";

/** Didit v3 `expected_details.id_country` requires ISO 3166-1 alpha-3 (e.g. NGA), not alpha-2. */
export function diditIdCountry(countryCode: string) {
  const code = isoCountries.alpha2ToAlpha3(countryCode.toUpperCase());
  if (!code) throw new Error(`No ISO alpha-3 code for country ${countryCode}`);
  return code;
}

export type VerificationProviderName = "didit" | "veriff" | "sumsub" | "manual";

export type CreateVerificationSessionInput = {
  vendorId: number;
  userId: number;
  sessionType: "identity_document" | "liveness" | "proof_of_residence" | "combined_na_vendor";
  countryCode: string;
  firstName?: string;
  lastName?: string;
  dateOfBirth?: string;
  callbackPath?: string;
};

export type VerificationSessionResult = {
  provider: VerificationProviderName;
  providerSessionId: string;
  verificationUrl?: string;
  status: "created" | "in_review" | "approved" | "declined";
  expiresAt: Date;
};

export interface VerificationAdapter {
  readonly provider: VerificationProviderName;
  isConfigured(): boolean;
  createSession(input: CreateVerificationSessionInput): Promise<VerificationSessionResult>;
}

export class DiditVerificationAdapter implements VerificationAdapter {
  readonly provider = "didit" as const;
  private readonly baseUrl = "https://verification.didit.me";

  isConfigured() {
    return Boolean(ENV.diditApiKey && ENV.diditWorkflowId);
  }

  async createSession(input: CreateVerificationSessionInput): Promise<VerificationSessionResult> {
    if (!this.isConfigured()) {
      throw new Error(
        "Didit verification is not configured on this server. Add DIDIT_API_KEY and DIDIT_WORKFLOW_ID in project secrets."
      );
    }

    const idCountry = diditIdCountry(input.countryCode);
    const callback = new URL(input.callbackPath || "/vendor?tab=profile&verification=complete", ENV.appUrl).toString();
    const response = await fetch(`${this.baseUrl}/v3/session/`, {
      method: "POST",
      signal: AbortSignal.timeout(15_000),
      headers: {
        "content-type": "application/json",
        "x-api-key": ENV.diditApiKey,
      },
      body: JSON.stringify({
        workflow_id: ENV.diditWorkflowId,
        vendor_data: `kwantu-user-${input.userId}`,
        callback,
        callback_method: "both",
        metadata: {
          kwantu_vendor_id: String(input.vendorId),
          kwantu_user_id: String(input.userId),
          session_type: input.sessionType,
          country_code: input.countryCode,
        },
        expected_details: {
          first_name: input.firstName || "Vendor",
          last_name: input.lastName || "Applicant",
          id_country: idCountry,
          ...(input.dateOfBirth ? { date_of_birth: input.dateOfBirth } : {}),
        },
      }),
    });

    const body = (await response.json().catch(() => ({}))) as {
      session_id?: string;
      url?: string;
      status?: string;
      detail?: string;
      message?: string;
    };

    if (!response.ok) {
      throw new Error(
        `Didit session creation failed with HTTP ${response.status}: ${body.detail || body.message || "provider rejected the request"}`
      );
    }
    if (!body.session_id || !body.url) {
      throw new Error("Didit returned an invalid hosted-session response");
    }

    return {
      provider: "didit",
      providerSessionId: body.session_id,
      verificationUrl: body.url,
      status: "created",
      expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
    };
  }
}

export class VeriffVerificationAdapter implements VerificationAdapter {
  readonly provider = "veriff" as const;

  isConfigured() {
    return false;
  }

  async createSession(_input: CreateVerificationSessionInput): Promise<VerificationSessionResult> {
    throw new Error("Veriff is disabled until its signed result integration is implemented.");
  }
}

export class SumsubVerificationAdapter implements VerificationAdapter {
  readonly provider = "sumsub" as const;

  isConfigured() {
    return false;
  }

  async createSession(_input: CreateVerificationSessionInput): Promise<VerificationSessionResult> {
    throw new Error("Sumsub is disabled until its hosted and signed result integration is implemented.");
  }
}

export class ManualVerificationAdapter implements VerificationAdapter {
  readonly provider = "manual" as const;

  isConfigured() {
    return true;
  }

  async createSession(input: CreateVerificationSessionInput): Promise<VerificationSessionResult> {
    return {
      provider: "manual",
      providerSessionId: `manual_${input.vendorId}_${randomUUID()}`,
      status: "created",
      expiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
    };
  }
}

export function selectVerificationAdapter(provider: VerificationProviderName = "didit"): VerificationAdapter {
  switch (provider) {
    case "didit":
      return new DiditVerificationAdapter();
    case "veriff":
      return new VeriffVerificationAdapter();
    case "sumsub":
      return new SumsubVerificationAdapter();
    case "manual":
      return new ManualVerificationAdapter();
    default:
      return new DiditVerificationAdapter();
  }
}
