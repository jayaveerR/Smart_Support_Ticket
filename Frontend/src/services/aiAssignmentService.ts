import { GoogleGenAI, Type } from "@google/genai";
import { Ticket, UserProfile } from "../types";

const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY || "" });

export async function assignTicketToAdmin(ticket: Ticket, admins: UserProfile[]): Promise<{ adminId: string; adminName: string; reasoning: string } | null> {
  if (admins.length === 0) return null;
  if (admins.length === 1) return { adminId: admins[0].uid, adminName: admins[0].name, reasoning: "Only one admin available." };

  try {
    const response = await ai.models.generateContent({
      model: "gemini-3-flash-preview",
      contents: `
        You are an expert support ticket dispatcher. 
        Analyze the following ticket and assign it to the most suitable admin from the provided list.
        
        Ticket Details:
        - Subject: ${ticket.subject}
        - Category: ${ticket.category}
        - Description: ${ticket.description}
        - Priority: ${ticket.priority}
        
        Available Admins:
        ${admins.map(a => `- Name: ${a.name}, Department: ${a.department || 'General'}, UID: ${a.uid}`).join('\n')}
        
        Selection Criteria:
        1. Match the ticket category to the admin's department if possible.
        2. Consider the subject and description for specific expertise.
        3. If no clear match, distribute fairly.
        
        Return the selected admin's UID, Name, and a brief reasoning.
      `,
      config: {
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            adminId: { type: Type.STRING, description: "The UID of the selected admin." },
            adminName: { type: Type.STRING, description: "The name of the selected admin." },
            reasoning: { type: Type.STRING, description: "Brief explanation for the assignment." }
          },
          required: ["adminId", "adminName", "reasoning"]
        }
      }
    });

    const result = JSON.parse(response.text || "{}");
    
    // Validate that the returned adminId exists in our list
    const selectedAdmin = admins.find(a => a.uid === result.adminId);
    if (selectedAdmin) {
      return {
        adminId: selectedAdmin.uid,
        adminName: selectedAdmin.name,
        reasoning: result.reasoning
      };
    }

    // Fallback to first admin if AI returned invalid ID
    return {
      adminId: admins[0].uid,
      adminName: admins[0].name,
      reasoning: "AI assignment failed or returned invalid ID. Defaulting to first available admin."
    };
  } catch (error) {
    console.error("AI Assignment Error:", error);
    return {
      adminId: admins[0].uid,
      adminName: admins[0].name,
      reasoning: "Error during AI analysis. Defaulting to first available admin."
    };
  }
}
