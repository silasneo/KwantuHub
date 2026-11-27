export type ReportFilters = {
  from?: Date;
  to?: Date;
};

export type AggregateReportRow = {
  domain: string;
  metric: string;
  value: number;
  rate?: string;
  note: string;
};

export function generateAggregateCsv(rows: AggregateReportRow[]): string {
  if (rows.some(row => !Number.isFinite(row.value)))
    throw new Error("Aggregate report contains a non-finite metric.");
  const cell = (value: string) => {
    const safe = /^\s*[=+\-@\t\r]/.test(value) ? `'${value}` : value;
    return `"${safe.replace(/"/g, '""')}"`;
  };
  const header = "Domain,Metric,Value,Rate,Note\n";
  const body = rows
    .map(
      r =>
        `${cell(r.domain)},${cell(r.metric)},${r.value},${cell(r.rate || "N/A")},${cell(r.note)}`
    )
    .join("\n");
  return header + body;
}

export function sanitizeReportOutput<T extends Record<string, any>>(
  data: T
): Partial<T> {
  const sanitized = { ...data };
  // Strictly delete any sensitive fields
  delete sanitized.vendorPrivateNotes;
  delete sanitized.messageBody;
  delete sanitized.identityEvidence;
  delete sanitized.buyerProfile;
  delete sanitized.phone;
  delete sanitized.email;
  return sanitized;
}
