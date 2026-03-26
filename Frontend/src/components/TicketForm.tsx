import React, { useState, useEffect } from 'react';
import { db, storage, auth } from '../lib/firebase';
import { collection, addDoc, serverTimestamp, updateDoc, doc, getDoc, getDocs, query, where } from 'firebase/firestore';
import { assignTicketToAdmin } from '../services/aiAssignmentService';

enum OperationType {
  CREATE = 'create',
  UPDATE = 'update',
  DELETE = 'delete',
  LIST = 'list',
  GET = 'get',
  WRITE = 'write',
}

interface FirestoreErrorInfo {
  error: string;
  operationType: OperationType;
  path: string | null;
  authInfo: {
    userId: string | undefined;
    email: string | null | undefined;
    emailVerified: boolean | undefined;
    isAnonymous: boolean | undefined;
    tenantId: string | null | undefined;
    providerInfo: {
      providerId: string;
      displayName: string | null;
      email: string | null;
      photoUrl: string | null;
    }[];
  }
}

function handleFirestoreError(error: unknown, operationType: OperationType, path: string | null) {
  const errInfo: FirestoreErrorInfo = {
    error: error instanceof Error ? error.message : String(error),
    authInfo: {
      userId: auth.currentUser?.uid,
      email: auth.currentUser?.email,
      emailVerified: auth.currentUser?.emailVerified,
      isAnonymous: auth.currentUser?.isAnonymous,
      tenantId: auth.currentUser?.tenantId,
      providerInfo: auth.currentUser?.providerData.map(provider => ({
        providerId: provider.providerId,
        displayName: provider.displayName,
        email: provider.email,
        photoUrl: provider.photoURL
      })) || []
    },
    operationType,
    path
  }
  console.error('Firestore Error: ', JSON.stringify(errInfo));
  throw new Error(JSON.stringify(errInfo));
}
import { ref, uploadBytes, getDownloadURL } from 'firebase/storage';
import { TicketCategory, TicketPriority, Ticket, UserProfile } from '../types';
import MapPicker from './MapPicker';
import { triggerN8nWebhook } from '../services/n8nService';
import { Loader2, Upload, MapPin, CheckCircle2, AlertCircle, Sparkles, Zap } from 'lucide-react';
import { cn } from '../lib/utils';

interface TicketFormProps {
  profile: UserProfile | null;
}

export default function TicketForm({ profile }: TicketFormProps) {
  const [loading, setLoading] = useState(false);
  const [submitted, setSubmitted] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [aiSummary, setAiSummary] = useState<string | null>(null);
  
  const [formData, setFormData] = useState({
    name: profile?.name || '',
    email: profile?.email || '',
    subject: '',
    category: 'General' as TicketCategory,
    priority: 'Medium' as TicketPriority,
    description: '',
    lastSeenLocation: '',
    dateOfMissing: '',
    adminComment: '',
  });

  useEffect(() => {
    if (profile) {
      setFormData(prev => ({
        ...prev,
        name: profile.name,
        email: profile.email
      }));
    }
  }, [profile]);

  const [location, setLocation] = useState<{ lat: number; lng: number } | null>(null);
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [imagePreview, setImagePreview] = useState<string | null>(null);

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => {
    const { name, value } = e.target;
    setFormData(prev => ({ ...prev, [name]: value }));
  };

  const handleImageChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      const file = e.target.files[0];
      setImageFile(file);
      setImagePreview(URL.createObjectURL(file));
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!db) {
      setError('Database not initialized. Please check your configuration.');
      return;
    }
    setLoading(true);
    setError(null);
    setAiSummary(null);

    try {
      let imageUrl = '';
      if (imageFile && storage) {
        try {
          const imageRef = ref(storage, `tickets/${Date.now()}_${imageFile.name}`);
          await uploadBytes(imageRef, imageFile);
          imageUrl = await getDownloadURL(imageRef);
        } catch (storageErr: any) {
          console.error('Storage error:', storageErr);
          throw new Error(`Failed to upload image: ${storageErr.message || 'Unknown error'}`);
        }
      }

      const ticketId = `TKT-${Math.random().toString(36).substr(2, 9).toUpperCase()}`;
      
      const ticketData: any = {
        ticketId,
        name: formData.name,
        email: formData.email,
        subject: formData.subject,
        category: formData.category,
        priority: formData.priority,
        description: formData.description,
        status: 'Open',
        type: 'new_ticket',
        adminComment: profile?.role === 'admin' ? formData.adminComment : '',
        timeline: [{
          status: 'Open',
          message: 'Ticket created successfully.',
          updatedAt: Date.now(),
        }],
      };

      if (profile?.uid) {
        ticketData.uid = profile.uid;
      }

      if (formData.category === 'Missing Cases') {
        ticketData.location = location ? { ...location, lastSeenLocation: formData.lastSeenLocation } : undefined;
        ticketData.imageUrl = imageUrl;
        ticketData.dateOfMissing = formData.dateOfMissing;
      }

      // 1. Fetch System Settings for Auto-Assignment
      let assignedAdmin = null;
      try {
        const settingsSnap = await getDoc(doc(db, 'settings', 'default'));
        const settings = settingsSnap.data();
        
        if (settings?.autoAssignment) {
          const adminsQuery = query(collection(db, 'users'), where('role', '==', 'admin'));
          const adminsSnap = await getDocs(adminsQuery);
          const admins = adminsSnap.docs.map(doc => doc.data() as UserProfile);
          
          if (admins.length > 0) {
            const assignmentResult = await assignTicketToAdmin({
              ...ticketData,
              id: 'temp',
              createdAt: Date.now()
            } as Ticket, admins);
            
            if (assignmentResult) {
              assignedAdmin = assignmentResult;
              ticketData.assignedAdminId = assignmentResult.adminId;
              ticketData.assignedAdminName = assignmentResult.adminName;
              ticketData.timeline.push({
                status: 'Open',
                message: `AI assigned ticket to ${assignmentResult.adminName}. Reasoning: ${assignmentResult.reasoning}`,
                updatedAt: Date.now()
              });
            }
          }
        }
      } catch (settingsErr) {
        console.error('[TicketForm] Error during auto-assignment:', settingsErr);
      }

      // 2. Save to Firebase
      let docRef;
      try {
        console.log('[TicketForm] Saving to Firestore:', ticketData);
        docRef = await addDoc(collection(db, 'tickets'), {
          ...ticketData,
          createdAt: serverTimestamp(),
        });
        console.log('[TicketForm] Firestore save successful, ID:', docRef.id);
      } catch (err) {
        console.error('[TicketForm] Firestore save failed:', err);
        // We don't throw here yet, we want to try triggering n8n anyway 
        // to see if we can get an AI summary or at least trigger the workflow
        setError('Ticket saved locally but failed to sync with database. Attempting to process...');
      }

      // 2. Trigger n8n webhook and get AI response
      const finalTicketData = { ...ticketData, id: docRef?.id || 'pending', createdAt: Date.now() } as Ticket;
      
      try {
        console.log('[TicketForm] Triggering n8n webhook...');
        const n8nResult = await triggerN8nWebhook(finalTicketData, 'new_ticket');
        console.log('[TicketForm] n8n result:', n8nResult);
        
        if (n8nResult && n8nResult.aiSummary) {
          setAiSummary(n8nResult.aiSummary);
          // Update Firebase with AI summary if we have a docRef
          if (docRef?.id) {
            try {
              await updateDoc(doc(db, 'tickets', docRef.id), {
                aiSummary: n8nResult.aiSummary
              });
            } catch (err) {
              console.error('[TicketForm] Failed to update AI summary in Firebase:', err);
            }
          }
        }
      } catch (webhookErr) {
        console.error('[TicketForm] Webhook trigger error:', webhookErr);
      }

      if (!docRef?.id) {
        // If Firestore failed, we show the error now after trying n8n
        throw new Error('Permission denied. Please ensure you are logged in and authorized.');
      }

      setSubmitted(ticketId);
    } catch (err: any) {
      console.error('Submission error:', err);
      let message = 'Failed to submit ticket. Please check your connection.';
      
      // Try to extract a more specific message
      if (err.message) {
        try {
          // Check if it's our JSON error info
          const parsed = JSON.parse(err.message);
          if (parsed.error) {
            message = `Submission failed: ${parsed.error}`;
            if (parsed.error.includes('Missing or insufficient permissions')) {
              message = 'Permission denied. Please ensure you are logged in and authorized.';
            }
          }
        } catch {
          // Not JSON, use the raw message
          message = `Submission failed: ${err.message}`;
        }
      }
      
      setError(message);
    } finally {
      setLoading(false);
    }
  };

  if (submitted) {
    return (
      <div className="max-w-2xl mx-auto p-10 bg-white rounded-3xl shadow-2xl text-center border border-gray-100">
        <div className="flex justify-center mb-8">
          <div className="w-20 h-20 bg-green-100 rounded-3xl flex items-center justify-center text-green-600 shadow-inner">
            <CheckCircle2 className="w-10 h-10" />
          </div>
        </div>
        <h2 className="text-2xl font-normal text-gray-900 mb-4">Ticket Submitted!</h2>
        <div className="flex items-center justify-center gap-2 mb-6">
          <div className="px-3 py-1 bg-pink-soft text-pink-primary rounded-full text-[10px] font-normal uppercase tracking-widest flex items-center gap-1.5 border border-pink-100">
            <Zap className="w-3 h-3" />
            n8n Workflow Activated
          </div>
        </div>
        <p className="text-sm text-gray-500 mb-8">
          Your ticket ID is <span className="font-mono font-normal text-pink-primary bg-pink-soft px-3 py-1 rounded-lg">{submitted}</span>.
          We have sent a confirmation email to <span className="text-gray-900">{formData.email}</span>.
        </p>

        {aiSummary && (
          <div className="mb-10 p-6 bg-pink-soft rounded-2xl border border-pink-100 text-left relative overflow-hidden">
            <div className="absolute top-0 right-0 p-4 opacity-10">
              <Sparkles className="w-12 h-12 text-pink-primary" />
            </div>
            <h3 className="text-xs font-normal text-pink-primary uppercase tracking-widest mb-3 flex items-center gap-2">
              <Sparkles className="w-4 h-4" />
              AI Assistant Summary
            </h3>
            <p className="text-gray-700 leading-relaxed italic text-sm">"{aiSummary}"</p>
          </div>
        )}

        <button
          onClick={() => { setSubmitted(null); setAiSummary(null); }}
          className="px-8 py-3 bg-pink-primary text-white rounded-xl hover:bg-pink-600 transition-all font-normal text-sm shadow-lg shadow-pink-100"
        >
          Submit Another Ticket
        </button>
      </div>
    );
  }

  return (
    <div className="max-w-3xl mx-auto p-8 md:p-12 bg-white rounded-2xl shadow-xl border border-gray-100">
      <div className="mb-10">
        <h1 className="text-2xl font-normal text-gray-900 tracking-tight">Submit Support Ticket</h1>
        <p className="text-gray-500 mt-2 text-sm">Fill out the form below and our AI-powered team will get back to you shortly.</p>
      </div>

      <form onSubmit={handleSubmit} className="space-y-6">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div className="space-y-1.5">
            <label className="text-xs font-normal text-gray-500 uppercase tracking-wider">Full Name</label>
            <input
              required
              name="name"
              disabled={!!profile}
              value={formData.name}
              onChange={handleInputChange}
              className="w-full px-4 py-2.5 bg-gray-50 border border-gray-200 rounded-lg focus:ring-2 focus:ring-pink-100 focus:border-pink-500 outline-none transition-all disabled:opacity-70 text-sm"
              placeholder="John Doe"
            />
          </div>
          <div className="space-y-1.5">
            <label className="text-xs font-normal text-gray-500 uppercase tracking-wider">Email Address</label>
            <input
              required
              type="email"
              name="email"
              disabled={!!profile}
              value={formData.email}
              onChange={handleInputChange}
              className="w-full px-4 py-2.5 bg-gray-50 border border-gray-200 rounded-lg focus:ring-2 focus:ring-pink-100 focus:border-pink-500 outline-none transition-all disabled:opacity-70 text-sm"
              placeholder="john@example.com"
            />
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div className="space-y-1.5">
            <label className="text-xs font-normal text-gray-500 uppercase tracking-wider">Category</label>
            <select
              name="category"
              value={formData.category}
              onChange={handleInputChange}
              className="w-full px-4 py-2.5 bg-gray-50 border border-gray-200 rounded-lg focus:ring-2 focus:ring-pink-100 focus:border-pink-500 outline-none transition-all appearance-none cursor-pointer text-sm"
            >
              <option>General</option>
              <option>Technical</option>
              <option>HR</option>
              <option>Payments</option>
              <option>Other</option>
              <option>Missing Cases</option>
            </select>
          </div>
          <div className="space-y-1.5">
            <label className="text-xs font-normal text-gray-500 uppercase tracking-wider">Priority</label>
            <select
              name="priority"
              value={formData.priority}
              onChange={handleInputChange}
              className="w-full px-4 py-2.5 bg-gray-50 border border-gray-200 rounded-lg focus:ring-2 focus:ring-pink-100 focus:border-pink-500 outline-none transition-all appearance-none cursor-pointer text-sm"
            >
              <option>Low</option>
              <option>Medium</option>
              <option>High</option>
              <option>Urgent</option>
            </select>
          </div>
        </div>

        <div className="space-y-1.5">
          <label className="text-xs font-normal text-gray-500 uppercase tracking-wider">Subject</label>
          <input
            required
            name="subject"
            value={formData.subject}
            onChange={handleInputChange}
            className="w-full px-4 py-2.5 bg-gray-50 border border-gray-200 rounded-lg focus:ring-2 focus:ring-pink-100 focus:border-pink-500 outline-none transition-all text-sm"
            placeholder="Brief summary of the issue"
          />
        </div>

        <div className="space-y-1.5">
          <label className="text-xs font-normal text-gray-500 uppercase tracking-wider">Description</label>
          <textarea
            required
            name="description"
            rows={4}
            value={formData.description}
            onChange={handleInputChange}
            className="w-full px-4 py-2.5 bg-gray-50 border border-gray-200 rounded-lg focus:ring-2 focus:ring-pink-100 focus:border-pink-500 outline-none transition-all resize-none text-sm"
            placeholder="Describe your issue in detail..."
          />
        </div>

        {profile?.role === 'admin' && (
          <div className="space-y-1.5 p-4 bg-gray-50 rounded-xl border border-gray-100">
            <label className="text-xs font-normal text-gray-500 uppercase tracking-wider flex items-center gap-2">
              <Zap className="w-4 h-4 text-pink-primary" />
              Admin Comment (Internal/Initial)
            </label>
            <textarea
              name="adminComment"
              rows={3}
              value={formData.adminComment}
              onChange={handleInputChange}
              className="w-full px-4 py-2.5 bg-white border border-gray-200 rounded-lg focus:ring-2 focus:ring-pink-100 focus:border-pink-500 outline-none transition-all resize-none text-sm"
              placeholder="Add an optional comment as an administrator..."
            />
          </div>
        )}

        {formData.category === 'Missing Cases' && (
          <div className="space-y-6 p-6 bg-pink-soft rounded-2xl border border-pink-100">
            <h3 className="text-lg font-normal text-pink-primary flex items-center gap-3">
              <AlertCircle className="w-5 h-5" />
              Missing Case Details
            </h3>
            
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div className="space-y-1.5">
                <label className="text-xs font-normal text-gray-500 uppercase tracking-wider">Last Seen Location</label>
                <input
                  name="lastSeenLocation"
                  value={formData.lastSeenLocation}
                  onChange={handleInputChange}
                  className="w-full px-4 py-2.5 bg-white border border-gray-200 rounded-lg focus:ring-2 focus:ring-pink-100 focus:border-pink-500 outline-none transition-all text-sm"
                  placeholder="e.g. Near Central Park"
                />
              </div>
              <div className="space-y-1.5">
                <label className="text-xs font-normal text-gray-500 uppercase tracking-wider">Date of Missing</label>
                <input
                  type="date"
                  name="dateOfMissing"
                  value={formData.dateOfMissing}
                  onChange={handleInputChange}
                  className="w-full px-4 py-2.5 bg-white border border-gray-200 rounded-lg focus:ring-2 focus:ring-pink-100 focus:border-pink-500 outline-none transition-all text-sm"
                />
              </div>
            </div>

            <div className="space-y-2">
              <label className="text-xs font-normal text-gray-500 uppercase tracking-wider flex items-center gap-2">
                <MapPin className="w-4 h-4 text-pink-primary" />
                Select Location on Map
              </label>
              <MapPicker onLocationSelect={(lat, lng) => setLocation({ lat, lng })} />
            </div>

            <div className="space-y-2">
              <label className="text-xs font-normal text-gray-500 uppercase tracking-wider flex items-center gap-2">
                <Upload className="w-4 h-4 text-pink-primary" />
                Upload Image
              </label>
              <div className="flex items-center gap-4">
                <label className="cursor-pointer flex items-center gap-3 px-4 py-2 bg-white border border-dashed border-gray-300 rounded-xl hover:border-pink-400 hover:bg-pink-50 transition-all group">
                  <Upload className="w-4 h-4 text-gray-400 group-hover:text-pink-primary" />
                  <span className="text-xs font-normal text-gray-600 group-hover:text-pink-primary">Choose File</span>
                  <input type="file" className="hidden" accept="image/*" onChange={handleImageChange} />
                </label>
                {imagePreview && (
                  <div className="relative group">
                    <img src={imagePreview} alt="Preview" className="w-16 h-16 object-cover rounded-xl border border-white shadow-md" />
                  </div>
                )}
              </div>
            </div>
          </div>
        )}

        {error && (
          <div className="p-4 bg-red-50 border border-red-100 rounded-xl text-red-600 text-xs font-normal flex items-center gap-3">
            <AlertCircle className="w-4 h-4" />
            {error}
          </div>
        )}

        <button
          type="submit"
          disabled={loading}
          className="w-full py-4 bg-pink-primary text-white rounded-xl font-normal text-sm hover:bg-pink-600 disabled:opacity-50 disabled:cursor-not-allowed transition-all shadow-lg shadow-pink-100 flex items-center justify-center gap-3"
        >
          {loading ? (
            <>
              <Loader2 className="w-5 h-5 animate-spin" />
              Processing with AI...
            </>
          ) : (
            <>
              <Sparkles className="w-5 h-5" />
              Submit Ticket
            </>
          )}
        </button>
      </form>
    </div>
  );
}
