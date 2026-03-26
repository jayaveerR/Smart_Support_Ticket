import { Ticket } from '../types';

export async function triggerN8nWebhook(ticket: any, actionType: string) {
  const isSubmission = actionType === 'activate' || actionType === 'new_ticket';
  const webhookUrl = isSubmission
    ? 'https://aotms.app.n8n.cloud/webhook/apply'
    : 'https://aotms.app.n8n.cloud/webhook/LMS011';
  
  // Handle different date formats (number, Date, or Firestore Timestamp)
  let dateValue: Date;
  if (ticket.createdAt) {
    if (typeof ticket.createdAt === 'number') {
      dateValue = new Date(ticket.createdAt);
    } else if (ticket.createdAt instanceof Date) {
      dateValue = ticket.createdAt;
    } else if (typeof (ticket.createdAt as any).toDate === 'function') {
      dateValue = (ticket.createdAt as any).toDate();
    } else {
      dateValue = new Date(ticket.createdAt);
    }
  } else {
    dateValue = new Date();
  }

  const payload = {
    ticketId: ticket.ticketId || ticket.id,
    id: ticket.id,
    name: ticket.name,
    email: ticket.email,
    subject: ticket.subject,
    category: ticket.category,
    priority: ticket.priority,
    status: ticket.status,
    action: actionType,
    type: actionType, // Use actionType as type for compatibility
    ticketType: ticket.type || 'new_ticket',
    description: ticket.description,
    createdAt: isNaN(dateValue.getTime()) ? new Date().toISOString() : dateValue.toISOString(),
    imageUrl: ticket.imageUrl,
    location: ticket.location,
    dateOfMissing: ticket.dateOfMissing,
    adminComment: ticket.adminComment,
    aiSummary: ticket.aiSummary,
    timestamp: new Date().toISOString()
  };

  console.log(`[n8n] Triggering webhook (${actionType}) at: ${webhookUrl}`);
  console.log('[n8n] Payload:', payload);
  
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 15000); // Increased to 15 seconds

  try {
    const response = await fetch(webhookUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Accept': 'application/json',
      },
      body: JSON.stringify(payload),
      signal: controller.signal,
    });
    
    clearTimeout(timeoutId);
    
    const responseText = await response.text();
    console.log(`[n8n] Response status: ${response.status}`);
    console.log(`[n8n] Response body: ${responseText}`);

    let result;
    try {
      result = JSON.parse(responseText);
    } catch (e) {
      result = { message: responseText };
    }

    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}, body: ${responseText}`);
    }
    
    return result;
  } catch (error: any) {
    if (error.name === 'AbortError') {
      console.error('[n8n] Webhook request timed out after 15s');
    } else {
      console.error('[n8n] Failed to trigger webhook:', error);
    }
    return null;
  }
}
