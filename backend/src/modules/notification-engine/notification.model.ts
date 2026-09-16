import { Schema, model, type HydratedDocument, type Model, type Types } from 'mongoose';

import type { TimestampFields } from '../../db/baseSchema.js';

export type NotificationType = 'FuelAlert' | 'MaintenanceAlert' | 'ContractExpiry' | 'OverdueCustomer' | 'GeneratorStoppedWhileAssigned';
export type NotificationSeverity = 'info' | 'warning' | 'critical';
export type NotificationStatus = 'Unread' | 'Read' | 'Dismissed';

export interface NotificationAttrs extends TimestampFields {
  _id: Types.ObjectId;
  type: NotificationType;
  severity: NotificationSeverity;
  title: string;
  message: string;
  entityType: string;
  entityId: Types.ObjectId | string;
  recipientRoles: string[];
  assignedUserId?: Types.ObjectId | null;
  status: NotificationStatus;
  dueDate?: Date | null;
  readAt?: Date | null;
}

const notificationSchema = new Schema<NotificationAttrs>(
  {
    type: { type: String, enum: ['FuelAlert', 'MaintenanceAlert', 'ContractExpiry', 'OverdueCustomer', 'GeneratorStoppedWhileAssigned'], required: true },
    severity: { type: String, enum: ['info', 'warning', 'critical'], required: true },
    title: { type: String, required: true, trim: true, maxlength: 150 },
    message: { type: String, required: true, trim: true, maxlength: 500 },
    entityType: { type: String, required: true, trim: true },
    entityId: { type: Schema.Types.Mixed, required: true },
    recipientRoles: { type: [{ type: String, trim: true }], required: true, validate: [(value: string[]) => value.length > 0] },
    assignedUserId: { type: Schema.Types.ObjectId, ref: 'User', default: null },
    status: { type: String, enum: ['Unread', 'Read', 'Dismissed'], default: 'Unread' },
    dueDate: { type: Date, default: null },
    readAt: { type: Date, default: null },
  },
  { timestamps: true },
);

notificationSchema.index({ recipientRoles: 1, status: 1, createdAt: -1 }, { name: 'notifications_recipient_status_created_idx' });
notificationSchema.index({ entityType: 1, entityId: 1 }, { name: 'notifications_entity_idx' });

export type NotificationDocument = HydratedDocument<NotificationAttrs>;
export const NotificationModel: Model<NotificationAttrs> = model<NotificationAttrs>('Notification', notificationSchema);
