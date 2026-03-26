export type TicketStatus = 'Open' | 'In Progress' | 'Resolved' | 'Paused';
export type TicketCategory = 'General' | 'Technical' | 'HR' | 'Payments' | 'Other' | 'Missing Cases';
export type TicketPriority = 'Low' | 'Medium' | 'High' | 'Urgent';

export interface UserProfile {
  uid: string;
  name: string;
  email: string;
  phone?: string;
  department?: string;
  role: 'user' | 'admin';
  createdAt: number;
}

export interface TimelineEntry {
  status: TicketStatus;
  message: string;
  updatedAt: number;
}

export interface ChatMessage {
  id?: string;
  senderId: string;
  senderName: string;
  senderRole: 'user' | 'admin';
  text: string;
  createdAt: number;
}

export interface Ticket {
  id: string;
  ticketId: string;
  uid?: string;
  name: string;
  email: string;
  subject: string;
  category: TicketCategory;
  priority: TicketPriority;
  description: string;
  status: TicketStatus;
  type: 'new_ticket';
  createdAt: number;
  location?: {
    lat: number;
    lng: number;
    lastSeenLocation?: string;
  };
  imageUrl?: string;
  dateOfMissing?: string;
  timeline: TimelineEntry[];
  adminComment?: string;
  aiSummary?: string;
  assignedAdminId?: string;
  assignedAdminName?: string;
}

export interface SystemSettings {
  id: string;
  autoAssignment: boolean;
  maintenanceMode: boolean;
  notificationEmail: string;
  maxTicketsPerUser: number;
  updatedAt: number;
  updatedBy: string;
}
