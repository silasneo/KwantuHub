import { users, vendorProfiles } from "../drizzle/schema";

export const accountSummaryColumns = {
  id: users.id,
  name: users.name,
  email: users.email,
  avatarUrl: users.avatarUrl,
  role: users.role,
  status: users.status,
  createdAt: users.createdAt,
};

export const publicVendorColumns = {
  id: vendorProfiles.id,
  businessName: vendorProfiles.businessName,
  description: vendorProfiles.description,
  location: vendorProfiles.location,
  serviceArea: vendorProfiles.serviceArea,
  remoteAvailable: vendorProfiles.remoteAvailable,
  website: vendorProfiles.website,
  approvalStatus: vendorProfiles.approvalStatus,
  approvedAt: vendorProfiles.approvedAt,
};
