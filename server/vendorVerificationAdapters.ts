import { ENV } from "./_core/env";
import type { NorthAmericaCountry } from "./vendorVerification";

export type VerificationProviderName = "didit" | "veriff" | "sumsub" | "manual";

export type CreateVerificationSessionInput = {
  vendorId: number;
  userId: number;
  sessionType: "identity_document" | "liveness" | "proof_of_residence" | "combined_na_vendor";
  countryCode: NorthAmericaCountry;
  firstName?: string;
  lastName?: string;
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

    const callback = `${ENV.appUrl}/vendor?tab=profile&verification=complete`;
    const response = await fetch(`${this.baseUrl}/v3/session/`, {
      method: "POST",
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
          id_country: input.countryCode,
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
    return Boolean(process.env.VERIFF_API_KEY && process.env.VERIFF_SECRET_KEY);
  }

  async createSession(input: CreateVerificationSessionInput): Promise<VerificationSessionResult> {
    const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
    if (!this.isConfigured()) {
      throw new Error(
        "Veriff verification credentials are not configured on this server. Please contact platform support or submit manual verification documents."
      );
    }

    const appUrl = ENV.appUrl;
    const response = await fetch("https://stationapi.veriff.com/v1/sessions", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-auth-client": process.env.VERIFF_API_KEY || "",
      },
      body: JSON.stringify({
        verification: {
          callback: `${appUrl}/api/webhooks/kyc/veriff`,
          person: { firstName: input.firstName, lastName: input.lastName },
          document: { country: input.countryCode },
          vendorData: String(input.vendorId),
        },
      }),
    });

    if (!response.ok) {
      throw new Error(`Veriff session creation failed with HTTP ${response.status}`);
    }

    const body = (await response.json()) as { verification?: { id?: string; url?: string } };
    if (!body.verification?.id) {
      throw new Error("Veriff returned an invalid session response");
    }

    return {
      provider: "veriff",
      providerSessionId: body.verification.id,
      verificationUrl: body.verification.url,
      status: "created",
      expiresAt,
    };
  }
}

export class SumsubVerificationAdapter implements VerificationAdapter {
  readonly provider = "sumsub" as const;

  isConfigured() {
    return Boolean(process.env.SUMSUB_APP_TOKEN && process.env.SUMSUB_SECRET_KEY);
  }

  async createSession(input: CreateVerificationSessionInput): Promise<VerificationSessionResult> {
    const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
    if (!this.isConfigured()) {
      throw new Error(
        "Sumsub verification credentials are not configured on this server. Please submit manual verification documents."
      );
    }
    return {
      provider: "sumsub",
      providerSessionId: `sumsub_${input.vendorId}_${Date.now()}`,
      status: "created",
      expiresAt,
    };
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
      providerSessionId: `manual_${input.vendorId}_${Date.now()}`,
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
