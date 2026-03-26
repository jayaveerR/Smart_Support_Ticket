import React, { useState, useEffect, useRef } from 'react';
import { db } from '../lib/firebase';
import { collection, addDoc, query, orderBy, onSnapshot, serverTimestamp } from 'firebase/firestore';
import { ChatMessage, UserProfile } from '../types';
import { Send, User, ShieldCheck, Loader2, MessageSquare } from 'lucide-react';
import { cn, formatDate } from '../lib/utils';
// Removed unused date-fns import

interface ChatProps {
  ticketId: string;
  profile: UserProfile;
}

export default function Chat({ ticketId, profile }: ChatProps) {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [newMessage, setNewMessage] = useState('');
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!db || !ticketId) return;

    const q = query(
      collection(db, 'tickets', ticketId, 'messages'),
      orderBy('createdAt', 'asc')
    );

    const unsubscribe = onSnapshot(q, (snapshot) => {
      const msgs = snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      })) as ChatMessage[];
      setMessages(msgs);
      setLoading(false);
      
      // Scroll to bottom
      setTimeout(() => {
        if (scrollRef.current) {
          scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
        }
      }, 100);
    }, (error) => {
      console.error('Chat error:', error);
      setLoading(false);
    });

    return () => unsubscribe();
  }, [ticketId]);

  const handleSendMessage = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newMessage.trim() || sending || !db) return;

    setSending(true);
    try {
      const messageData: ChatMessage = {
        senderId: profile.uid,
        senderName: profile.name,
        senderRole: profile.role,
        text: newMessage.trim(),
        createdAt: Date.now()
      };

      await addDoc(collection(db, 'tickets', ticketId, 'messages'), messageData);
      setNewMessage('');
    } catch (error) {
      console.error('Failed to send message:', error);
    } finally {
      setSending(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center p-8">
        <Loader2 className="w-6 h-6 animate-spin text-pink-primary" />
      </div>
    );
  }

  return (
    <div className="flex flex-col h-[500px] bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
      <div className="p-4 border-b border-gray-100 bg-gray-50 flex items-center justify-between">
        <h3 className="text-sm font-normal text-gray-900 flex items-center gap-2">
          <MessageSquare className="w-4 h-4 text-pink-primary" />
          Support Chat
        </h3>
        <span className="text-[10px] text-gray-400 uppercase tracking-widest">Real-time</span>
      </div>

      <div 
        ref={scrollRef}
        className="flex-1 overflow-y-auto p-4 space-y-4 bg-gray-50/30"
      >
        {messages.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full text-center p-8">
            <div className="w-12 h-12 bg-gray-100 rounded-full flex items-center justify-center mb-3">
              <MessageSquare className="w-6 h-6 text-gray-300" />
            </div>
            <p className="text-xs text-gray-400">No messages yet. Start the conversation!</p>
          </div>
        ) : (
          messages.map((msg) => (
            <div 
              key={msg.id}
              className={cn(
                "flex flex-col max-w-[80%]",
                msg.senderId === profile.uid ? "ml-auto items-end" : "mr-auto items-start"
              )}
            >
              <div className="flex items-center gap-2 mb-1 px-1">
                <span className="text-[10px] font-normal text-gray-400">
                  {msg.senderName}
                </span>
                {msg.senderRole === 'admin' && (
                  <ShieldCheck className="w-3 h-3 text-blue-500" />
                )}
              </div>
              <div className={cn(
                "px-4 py-2 rounded-2xl text-sm",
                msg.senderId === profile.uid 
                  ? "bg-pink-primary text-white rounded-tr-none shadow-sm" 
                  : "bg-white border border-gray-100 text-gray-700 rounded-tl-none shadow-sm"
              )}>
                {msg.text}
              </div>
              <span className="text-[9px] text-gray-400 mt-1 px-1">
                {formatDate(msg.createdAt, 'HH:mm')}
              </span>
            </div>
          ))
        )}
      </div>

      <form onSubmit={handleSendMessage} className="p-4 border-t border-gray-100 bg-white">
        <div className="flex gap-2">
          <input
            type="text"
            value={newMessage}
            onChange={(e) => setNewMessage(e.target.value)}
            placeholder="Type your message..."
            className="flex-1 px-4 py-2 bg-gray-50 border border-gray-200 rounded-xl text-sm focus:ring-2 focus:ring-pink-100 focus:border-pink-500 outline-none transition-all"
          />
          <button
            type="submit"
            disabled={!newMessage.trim() || sending}
            className="p-2 bg-pink-primary text-white rounded-xl hover:bg-pink-600 disabled:opacity-50 transition-all shadow-lg shadow-pink-100"
          >
            {sending ? (
              <Loader2 className="w-5 h-5 animate-spin" />
            ) : (
              <Send className="w-5 h-5" />
            )}
          </button>
        </div>
      </form>
    </div>
  );
}

