"use client";

import { useCallback, useEffect, useState } from "react";

type PendingVendor = {
  id: string;
  businessName: string;
  description?: string;
  location?: string;
  serviceArea?: string;
  remoteAvailable: boolean;
  user: { name: string; email: string };
};

export default function AdminDashboard() {
  const [vendors, setVendors] = useState<PendingVendor[]>([]);
  const [notice, setNotice] = useState("");
  const load = useCallback(async () => {
    const response = await fetch("/api/v1/admin/vendors");
    const body = await response.json();
    setVendors(body.data ?? []);
  }, []);
  useEffect(() => {
    void load();
  }, [load]);

  async function decide(
    vendorId: string,
    status: "APPROVED" | "REJECTED" | "SUSPENDED",
  ) {
    const response = await fetch("/api/v1/admin/vendors", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ vendorId, status }),
    });
    setNotice(
      response.ok
        ? `Vendor status changed to ${status}.`
        : "The status could not be changed.",
    );
    await load();
  }

  return (
    <main className="shell page">
      <p className="eyebrow">Admin governance</p>
      <h1>
        Approve trusted <em>vendors.</em>
      </h1>
      <p className="copy">
        Inspect vendor profiles before they can publish to the public
        marketplace.
      </p>
      {notice && <div className="notice">{notice}</div>}
      {vendors.length === 0 ? (
        <div className="empty-state">No vendors are waiting for review.</div>
      ) : (
        <div className="table-wrap">
          <table className="table">
            <thead>
              <tr>
                <th>Business</th>
                <th>Applicant</th>
                <th>Profile</th>
                <th>Action</th>
              </tr>
            </thead>
            <tbody>
              {vendors.map((vendor) => (
                <tr key={vendor.id}>
                  <td>
                    <b>{vendor.businessName}</b>
                    <br />
                    <span className="muted">
                      {vendor.location || "No location"}
                    </span>
                  </td>
                  <td>
                    {vendor.user.name}
                    <br />
                    <span className="muted">{vendor.user.email}</span>
                  </td>
                  <td>
                    {vendor.description || "No description"}
                    <br />
                    <span className="muted">
                      {vendor.remoteAvailable
                        ? "Remote available"
                        : vendor.serviceArea || "Local service"}
                    </span>
                  </td>
                  <td>
                    <div className="button-row">
                      <button
                        className="button primary"
                        onClick={() => decide(vendor.id, "APPROVED")}
                      >
                        Approve
                      </button>
                      <button
                        className="button secondary"
                        onClick={() => decide(vendor.id, "REJECTED")}
                      >
                        Reject
                      </button>
                      <button
                        className="button secondary"
                        onClick={() => decide(vendor.id, "SUSPENDED")}
                      >
                        Suspend
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </main>
  );
}
