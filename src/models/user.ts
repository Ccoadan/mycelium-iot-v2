import type { ObjectId } from 'mongodb';

export const USER_ROLES = ['admin', 'viewer'] as const;
export type UserRole = (typeof USER_ROLES)[number];

export interface User {
  _id?: ObjectId;
  username: string;
  passwordHash: string;
  role: UserRole;
  active: boolean;
  sessionVersion: number;
  createdAt: Date;
  updatedAt: Date;
}
