import React, { useState } from 'react';
import { db, auth } from '../lib/firebase';
import { collection, query, where, getDocs, onSnapshot, doc } from 'firebase/firestore';
import { Ticket, UserProfile } from '../types';
import Chat from './Chat';

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
import { Search, Clock, CheckCircle2, AlertCircle, History, MapPin, ExternalLink, Zap } from 'lucide-react';
import { cn, formatDate } from '../lib/utils';

export default function TicketTracking({ profile }: { profile: UserProfile | null }) {
  const [ticketId, setTicketId] = useState('');
  const [ticket, setTicket] = useState<Ticket | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Real-time listener for the tracked ticket
  React.useEffect(() => {
    if (!ticket?.id || !db) return;
    
    const unsubscribe = onSnapshot(doc(db, 'tickets', ticket.id), (docSnapshot) => {
      if (docSnapshot.exists()) {
        const data = docSnapshot.data();
        setTicket({ 
          id: docSnapshot.id, 
          ...data,
          createdAt: data.createdAt?.toMillis ? data.createdAt.toMillis() : data.createdAt
        } as Ticket);
      }
    }, (err) => {
      handleFirestoreError(err, OperationType.GET, `tickets/${ticket.id}`);
    });

    return () => unsubscribe();
  }, [ticket?.id]);

  const handleTrack = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!ticketId.trim()) return;
    
    setLoading(true);
    setError(null);
    setTicket(null);

    try {
      if (!db) throw new Error('Firebase not configured');
      const q = query(collection(db, 'tickets'), where('ticketId', '==', ticketId.trim().toUpperCase()));
      let snapshot;
      try {
        snapshot = await getDocs(q);
      } catch (err) {
        handleFirestoreError(err, OperationType.LIST, 'tickets');
      }
      
      if (snapshot.empty) {
        setError('No ticket found with this ID.');
      } else {
        const data = snapshot.docs[0].data();
        setTicket({ 
          id: snapshot.docs[0].id, 
          ...data,
          createdAt: data.createdAt?.toMillis ? data.createdAt.toMillis() : data.createdAt
        } as Ticket);
      }
    } catch (err) {
      console.error('Tracking error:', err);
      setError('An error occurred while tracking the ticket.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="max-w-4xl mx-auto p-6 space-y-8">
      <div className="text-center space-y-4">
        <h1 className="text-2xl font-normal text-gray-900 tracking-tight">Track Your Ticket</h1>
        <p className="text-gray-500 max-w-md mx-auto text-sm">Enter your unique Ticket ID to see the real-time status and progress of your request.</p>
      </div>

      <form onSubmit={handleTrack} className="max-w-md mx-auto relative">
        <input 
          required
          placeholder="Enter Ticket ID (e.g. TKT-ABC123XYZ)"
          value={ticketId}
          onChange={(e) => setTicketId(e.target.value)}
          className="w-full pl-6 pr-16 py-3 bg-white border border-gray-100 rounded-xl shadow-lg focus:ring-2 focus:ring-pink-100 focus:border-pink-500 outline-none transition-all font-mono font-normal text-sm"
        />
        <button 
          type="submit"
          disabled={loading}
          className="absolute right-1.5 top-1.5 bottom-1.5 px-4 bg-pink-primary text-white rounded-lg hover:bg-pink-600 transition-colors disabled:opacity-50"
        >
          {loading ? <Clock className="w-4 h-4 animate-spin" /> : <Search className="w-4 h-4" />}
        </button>
      </form>

      {error && (
        <div className="max-w-md mx-auto p-4 bg-red-50 border border-red-100 rounded-xl text-red-600 text-xs flex items-center gap-3">
          <AlertCircle className="w-4 h-4" />
          {error}
        </div>
      )}

      {ticket && (
        <div className="bg-white rounded-2xl shadow-xl border border-gray-100 overflow-hidden animate-in fade-in slide-in-from-bottom-4 duration-500">
          <div className="bg-pink-primary p-6 text-white flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
            <div>
              <p className="text-pink-100 text-[10px] font-normal uppercase tracking-widest mb-1">Ticket ID</p>
              <h2 className="text-xl font-normal font-mono">{ticket.ticketId}</h2>
            </div>
            <div className="flex items-center gap-3 px-4 py-2 bg-white/10 backdrop-blur-md rounded-xl border border-white/20">
              <div className={cn(
                "w-2 h-2 rounded-full animate-pulse",
                ticket.status === 'Resolved' ? "bg-green-400" :
                ticket.status === 'In Progress' ? "bg-pink-200" :
                "bg-orange-400"
              )} />
              <span className="font-normal text-sm">{ticket.status}</span>
            </div>
          </div>

          <div className="p-6 grid grid-cols-1 lg:grid-cols-2 gap-8">
            <div className="space-y-6">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <p className="text-[10px] font-normal text-gray-400 uppercase tracking-wider mb-1">Category</p>
                  <p className="text-sm font-normal text-gray-900">{ticket.category}</p>
                </div>
                <div>
                  <p className="text-[10px] font-normal text-gray-400 uppercase tracking-wider mb-1">Priority</p>
                  <p className="text-sm font-normal text-gray-900">{ticket.priority}</p>
                </div>
                <div>
                  <p className="text-[10px] font-normal text-gray-400 uppercase tracking-wider mb-1">Assigned To</p>
                  <p className="text-sm font-normal text-gray-900">{ticket.assignedAdminName || 'Unassigned'}</p>
                </div>
              </div>

              <div>
                <p className="text-[10px] font-normal text-gray-400 uppercase tracking-wider mb-2">Subject</p>
                <p className="text-sm font-normal text-gray-900">{ticket.subject}</p>
              </div>

              <div>
                <p className="text-[10px] font-normal text-gray-400 uppercase tracking-wider mb-2">Description</p>
                <p className="text-xs text-gray-600 leading-relaxed">{ticket.description}</p>
              </div>

              {ticket.adminComment && (
                <div className="p-4 bg-pink-soft/30 rounded-xl border border-pink-100/50">
                  <p className="text-[10px] font-normal text-pink-primary uppercase tracking-wider mb-2 flex items-center gap-2">
                    <Zap className="w-3 h-3" />
                    Admin Comment
                  </p>
                  <p className="text-xs text-gray-700 leading-relaxed italic">"{ticket.adminComment}"</p>
                </div>
              )}

              {ticket.category === 'Missing Cases' && (
                <div className="p-4 bg-pink-soft rounded-xl border border-pink-100 space-y-4">
                  <h4 className="text-xs font-normal text-pink-primary flex items-center gap-2">
                    <MapPin className="w-4 h-4" />
                    Missing Case Details
                  </h4>
                  {ticket.imageUrl && (
                    <img src={ticket.imageUrl} alt="Missing" className="w-full h-48 object-cover rounded-lg shadow-md" />
                  )}
                  <div className="grid grid-cols-2 gap-4 text-[10px]">
                    <div>
                      <p className="text-pink-primary font-normal uppercase">Last Seen</p>
                      <p className="text-gray-900">{ticket.location?.lastSeenLocation || 'N/A'}</p>
                    </div>
                    <div>
                      <p className="text-pink-primary font-normal uppercase">Date</p>
                      <p className="text-gray-900">{ticket.dateOfMissing || 'N/A'}</p>
                    </div>
                  </div>
                </div>
              )}
            </div>

            <div className="space-y-6">
              <h3 className="text-sm font-normal text-gray-900 flex items-center gap-2">
                <History className="w-4 h-4 text-pink-primary" />
                Status Timeline
              </h3>
              <div className="space-y-6 relative before:absolute before:left-[7px] before:top-2 before:bottom-2 before:w-0.5 before:bg-gray-100">
                {ticket.timeline.map((entry, idx) => (
                  <div key={idx} className="relative pl-8">
                    <div className={cn(
                      "absolute left-0 top-1 w-4 h-4 rounded-full border-2 border-white shadow-sm flex items-center justify-center",
                      entry.status === 'Resolved' ? "bg-green-500" :
                      entry.status === 'In Progress' ? "bg-pink-primary" :
                      "bg-gray-400"
                    )}>
                      {entry.status === 'Resolved' && <CheckCircle2 className="w-2 h-2 text-white" />}
                    </div>
                    <div className="bg-gray-50 p-3 rounded-xl border border-gray-100">
                      <div className="flex justify-between items-start mb-1">
                        <p className="text-xs font-normal text-gray-900">{entry.status}</p>
                        <p className="text-[8px] font-normal text-gray-400">{formatDate(entry.updatedAt, 'MMM d, HH:mm')}</p>
                      </div>
                      <p className="text-[10px] text-gray-600">{entry.message}</p>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* Chat Section */}
          {profile && (profile.email === ticket.email || profile.role === 'admin') && (
            <div className="p-6 border-t border-gray-100 bg-gray-50/50">
              <div className="max-w-2xl mx-auto">
                <Chat ticketId={ticket.id} profile={profile} />
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
