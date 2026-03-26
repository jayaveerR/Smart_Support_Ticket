import React, { useState, useEffect } from 'react';
import { db, auth } from '../lib/firebase';
import { collection, query, orderBy, onSnapshot, doc, updateDoc, arrayUnion } from 'firebase/firestore';
import { Ticket, TicketStatus, TicketCategory, TicketPriority, TimelineEntry, UserProfile } from '../types';
import Chat from './Chat';
import AdminAnalytics from './AdminAnalytics';
import AdminSettings from './AdminSettings';
import { triggerN8nWebhook } from '../services/n8nService';
import { 
  Search, Filter, Clock, CheckCircle2, PlayCircle, PauseCircle, 
  MessageSquare, History, MapPin, ExternalLink, ChevronRight,
  BarChart3, Users, Ticket as TicketIcon, AlertCircle, Sparkles,
  ArrowRightCircle, Zap, Edit3, Settings, PieChart as PieChartIcon,
  ShieldCheck, FileDown, Calendar, ChevronLeft
} from 'lucide-react';
import { cn, formatDate } from '../lib/utils';

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

type AdminTab = 'tickets' | 'analytics' | 'settings' | 'users';

export default function AdminDashboard({ profile }: { profile: UserProfile }) {
  const [activeTab, setActiveTab] = useState<AdminTab>('tickets');
  const [tickets, setTickets] = useState<Ticket[]>([]);
  const [users, setUsers] = useState<UserProfile[]>([]);
  const [selectedTicket, setSelectedTicket] = useState<Ticket | null>(null);
  const [adminComment, setAdminComment] = useState('');
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [filterStatus, setFilterStatus] = useState<string>('All');
  const [filterPriority, setFilterPriority] = useState<string>('All');
  const [startDate, setStartDate] = useState<string>('');
  const [endDate, setEndDate] = useState<string>('');
  
  // Pagination State
  const [currentPage, setCurrentPage] = useState(1);
  const TICKETS_PER_PAGE = 10;
  
  // Edit Ticket State
  const [isEditing, setIsEditing] = useState(false);
  const [editSubject, setEditSubject] = useState('');
  const [editDescription, setEditDescription] = useState('');
  const [editStatus, setEditStatus] = useState<TicketStatus>('Open');
  const [editCategory, setEditCategory] = useState<TicketCategory>('General');
  const [editPriority, setEditPriority] = useState<TicketPriority>('Low');
  const [editAdminComment, setEditAdminComment] = useState('');
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    if (selectedTicket) {
      setEditSubject(selectedTicket.subject);
      setEditDescription(selectedTicket.description);
      setEditStatus(selectedTicket.status);
      setEditCategory(selectedTicket.category);
      setEditPriority(selectedTicket.priority);
      setEditAdminComment(selectedTicket.adminComment || '');
      setIsEditing(false);
    }
  }, [selectedTicket]);

  const handleUpdateTicket = async () => {
    if (!db || !selectedTicket) return;
    setIsSaving(true);
    
    const ticketRef = doc(db, 'tickets', selectedTicket.id);
    
    const changes: string[] = [];
    if (editSubject !== selectedTicket.subject) changes.push('Subject');
    if (editDescription !== selectedTicket.description) changes.push('Description');
    if (editStatus !== selectedTicket.status) changes.push(`Status to ${editStatus}`);
    if (editCategory !== selectedTicket.category) changes.push(`Category to ${editCategory}`);
    if (editPriority !== selectedTicket.priority) changes.push(`Priority to ${editPriority}`);
    if (editAdminComment !== (selectedTicket.adminComment || '')) changes.push('Admin Comment');

    const timelineEntry: TimelineEntry = {
      status: editStatus,
      message: `Ticket details updated by admin. ${changes.length > 0 ? `Changes: ${changes.join(', ')}` : 'No significant changes.'}`,
      updatedAt: Date.now(),
    };

    try {
      await updateDoc(ticketRef, {
        subject: editSubject,
        description: editDescription,
        status: editStatus,
        category: editCategory,
        priority: editPriority,
        adminComment: editAdminComment,
        timeline: arrayUnion(timelineEntry),
      });

      // Trigger n8n webhook
      const actionMap: Record<string, string> = {
        'In Progress': 'in_progress',
        'Resolved': 'resolved',
        'Paused': 'paused'
      };
      await triggerN8nWebhook({ 
        ...selectedTicket, 
        status: editStatus, 
        subject: editSubject, 
        description: editDescription,
        category: editCategory,
        priority: editPriority
      }, actionMap[editStatus] || 'status_update');
      
      setIsEditing(false);
      setSelectedTicket(prev => prev ? { 
        ...prev, 
        subject: editSubject, 
        description: editDescription, 
        status: editStatus,
        category: editCategory,
        priority: editPriority,
        adminComment: editAdminComment,
        timeline: [...prev.timeline, timelineEntry] 
      } : null);
      alert('Ticket updated successfully!');
    } catch (error) {
      handleFirestoreError(error, OperationType.UPDATE, `tickets/${selectedTicket.id}`);
    } finally {
      setIsSaving(false);
    }
  };

  const handleExportCSV = () => {
    const headers = ['Ticket ID', 'User', 'Email', 'Subject', 'Category', 'Priority', 'Status', 'Created At', 'Description'];
    const csvContent = [
      headers.join(','),
      ...filteredTickets.map(t => [
        t.ticketId,
        `"${t.name.replace(/"/g, '""')}"`,
        t.email,
        `"${t.subject.replace(/"/g, '""')}"`,
        t.category,
        t.priority,
        t.status,
        formatDate(t.createdAt, 'yyyy-MM-dd HH:mm:ss'),
        `"${t.description.replace(/"/g, '""')}"`
      ].join(','))
    ].join('\n');

    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    const url = URL.createObjectURL(blob);
    link.setAttribute('href', url);
    link.setAttribute('download', `tickets_export_${new Date().toISOString().split('T')[0]}.csv`);
    link.style.visibility = 'hidden';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  useEffect(() => {
    if (!db) return;
    const q = query(collection(db, 'tickets'), orderBy('createdAt', 'desc'));
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const ticketData = snapshot.docs.map(doc => {
        const data = doc.data();
        return {
          id: doc.id,
          ...data,
          createdAt: data.createdAt?.toMillis ? data.createdAt.toMillis() : data.createdAt
        };
      }) as Ticket[];
      setTickets(ticketData);
      setLoading(false);
    }, (error) => {
      handleFirestoreError(error, OperationType.LIST, 'tickets');
    });
    return () => unsubscribe();
  }, []);

  useEffect(() => {
    if (!db || activeTab !== 'users') return;
    const q = query(collection(db, 'users'), orderBy('createdAt', 'desc'));
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const userData = snapshot.docs.map(doc => ({
        ...doc.data()
      })) as UserProfile[];
      setUsers(userData);
    }, (error) => {
      handleFirestoreError(error, OperationType.LIST, 'users');
    });
    return () => unsubscribe();
  }, [activeTab]);

  const handleStatusUpdate = async (ticket: Ticket, newStatus: TicketStatus) => {
    if (!db) return;
    const ticketRef = doc(db, 'tickets', ticket.id);
    const timelineEntry: TimelineEntry = {
      status: newStatus,
      message: adminComment || `Status updated to ${newStatus}`,
      updatedAt: Date.now(),
    };

    try {
      await updateDoc(ticketRef, {
        status: newStatus,
        timeline: arrayUnion(timelineEntry),
        adminComment: adminComment || ticket.adminComment || ''
      });

      // Trigger n8n webhook
      const actionMap: Record<string, string> = {
        'In Progress': 'in_progress',
        'Resolved': 'resolved',
        'Paused': 'paused'
      };
      await triggerN8nWebhook({ ...ticket, status: newStatus }, actionMap[newStatus] || 'status_update');
      
      setAdminComment('');
      setSelectedTicket(prev => prev ? { ...prev, status: newStatus, timeline: [...prev.timeline, timelineEntry] } : null);
    } catch (error) {
      handleFirestoreError(error, OperationType.UPDATE, `tickets/${ticket.id}`);
    }
  };

  const handlePass = async (ticket: Ticket) => {
    if (!db) return;
    const ticketRef = doc(db, 'tickets', ticket.id);
    const timelineEntry: TimelineEntry = {
      status: ticket.status,
      message: adminComment || "Ticket passed for further review",
      updatedAt: Date.now(),
    };

    try {
      await updateDoc(ticketRef, {
        timeline: arrayUnion(timelineEntry),
        adminComment: adminComment || ticket.adminComment || ''
      });

      // Trigger n8n webhook with 'pass' action
      await triggerN8nWebhook(ticket, 'pass');
      
      setAdminComment('');
      setSelectedTicket(prev => prev ? { ...prev, timeline: [...prev.timeline, timelineEntry] } : null);
    } catch (error) {
      handleFirestoreError(error, OperationType.UPDATE, `tickets/${ticket.id}`);
    }
  };

  const handleTrigger = async (ticket: Ticket) => {
    try {
      await triggerN8nWebhook(ticket, 'trigger');
      alert('Manual trigger sent successfully!');
    } catch (error) {
      console.error('Trigger error:', error);
      alert('Failed to send manual trigger.');
    }
  };

  const handleRoleUpdate = async (userId: string, newRole: 'user' | 'admin') => {
    if (!db) return;
    if (userId === auth.currentUser?.uid) {
      alert("You cannot change your own role.");
      return;
    }

    const userRef = doc(db, 'users', userId);
    try {
      await updateDoc(userRef, { role: newRole });
      alert(`User role updated to ${newRole}`);
    } catch (error) {
      handleFirestoreError(error, OperationType.UPDATE, `users/${userId}`);
    }
  };

  const filteredTickets = tickets.filter(t => {
    const matchesSearch = t.ticketId.toLowerCase().includes(searchTerm.toLowerCase()) || 
                         t.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
                         t.subject.toLowerCase().includes(searchTerm.toLowerCase());
    const matchesStatus = filterStatus === 'All' || t.status === filterStatus;
    const matchesPriority = filterPriority === 'All' || t.priority === filterPriority;
    
    const ticketDate = new Date(t.createdAt);
    const matchesStartDate = !startDate || ticketDate >= new Date(startDate);
    const matchesEndDate = !endDate || ticketDate <= new Date(new Date(endDate).setHours(23, 59, 59, 999));
    
    return matchesSearch && matchesStatus && matchesPriority && matchesStartDate && matchesEndDate;
  });

  // Reset pagination when filters change
  useEffect(() => {
    setCurrentPage(1);
  }, [searchTerm, filterStatus, filterPriority, startDate, endDate]);

  const totalPages = Math.ceil(filteredTickets.length / TICKETS_PER_PAGE);
  const paginatedTickets = filteredTickets.slice(
    (currentPage - 1) * TICKETS_PER_PAGE,
    currentPage * TICKETS_PER_PAGE
  );

  const stats = {
    total: tickets.length,
    open: tickets.filter(t => t.status === 'Open').length,
    inProgress: tickets.filter(t => t.status === 'In Progress').length,
    resolved: tickets.filter(t => t.status === 'Resolved').length,
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-screen">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div>
      </div>
    );
  }

  return (
    <div className="max-w-[1600px] mx-auto p-6 space-y-8">
      {/* Admin Navigation Tabs */}
      <div className="flex items-center gap-2 bg-gray-50 p-1 rounded-2xl border border-gray-100 w-fit">
        <button
          onClick={() => setActiveTab('tickets')}
          className={cn(
            "flex items-center gap-2 px-6 py-3 rounded-xl text-xs font-normal transition-all",
            activeTab === 'tickets' ? "bg-black text-white shadow-lg" : "text-gray-500 hover:text-black hover:bg-white"
          )}
        >
          <TicketIcon className="w-4 h-4" />
          Tickets
        </button>
        <button
          onClick={() => setActiveTab('analytics')}
          className={cn(
            "flex items-center gap-2 px-6 py-3 rounded-xl text-xs font-normal transition-all",
            activeTab === 'analytics' ? "bg-black text-white shadow-lg" : "text-gray-500 hover:text-black hover:bg-white"
          )}
        >
          <PieChartIcon className="w-4 h-4" />
          Analytics
        </button>
        <button
          onClick={() => setActiveTab('users')}
          className={cn(
            "flex items-center gap-2 px-6 py-3 rounded-xl text-xs font-normal transition-all",
            activeTab === 'users' ? "bg-black text-white shadow-lg" : "text-gray-500 hover:text-black hover:bg-white"
          )}
        >
          <Users className="w-4 h-4" />
          Users
        </button>
        <button
          onClick={() => setActiveTab('settings')}
          className={cn(
            "flex items-center gap-2 px-6 py-3 rounded-xl text-xs font-normal transition-all",
            activeTab === 'settings' ? "bg-black text-white shadow-lg" : "text-gray-500 hover:text-black hover:bg-white"
          )}
        >
          <Settings className="w-4 h-4" />
          Settings
        </button>
      </div>

      {activeTab === 'tickets' && (
        <>
          {/* Header & Stats */}
          <div className="grid grid-cols-1 md:grid-cols-4 gap-6 animate-in fade-in slide-in-from-top-4 duration-500">
            <div className="bg-white p-6 rounded-2xl shadow-sm border border-gray-100 flex items-center gap-4">
              <div className="p-3 bg-blue-50 rounded-xl text-blue-600">
                <TicketIcon className="w-6 h-6" />
              </div>
              <div>
                <p className="text-xs text-gray-500 font-normal">Total Tickets</p>
                <p className="text-xl font-normal text-gray-900">{stats.total}</p>
              </div>
            </div>
            <div className="bg-white p-6 rounded-2xl shadow-sm border border-gray-100 flex items-center gap-4">
              <div className="p-3 bg-orange-50 rounded-xl text-orange-600">
                <Clock className="w-6 h-6" />
              </div>
              <div>
                <p className="text-xs text-gray-500 font-normal">Open</p>
                <p className="text-xl font-normal text-gray-900">{stats.open}</p>
              </div>
            </div>
            <div className="bg-white p-6 rounded-2xl shadow-sm border border-gray-100 flex items-center gap-4">
              <div className="p-3 bg-pink-soft rounded-xl text-pink-primary">
                <PlayCircle className="w-6 h-6" />
              </div>
              <div>
                <p className="text-xs text-gray-500 font-normal">In Progress</p>
                <p className="text-xl font-normal text-gray-900">{stats.inProgress}</p>
              </div>
            </div>
            <div className="bg-white p-6 rounded-2xl shadow-sm border border-gray-100 flex items-center gap-4">
              <div className="p-3 bg-green-50 rounded-xl text-green-600">
                <CheckCircle2 className="w-6 h-6" />
              </div>
              <div>
                <p className="text-xs text-gray-500 font-normal">Resolved</p>
                <p className="text-xl font-normal text-gray-900">{stats.resolved}</p>
              </div>
            </div>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-3 gap-8 animate-in fade-in slide-in-from-bottom-4 duration-700">
            {/* Ticket List */}
            <div className="lg:col-span-2 space-y-6">
              <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
                <div className="p-6 border-b border-gray-100 space-y-4">
                  <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                    <h2 className="text-lg font-normal text-gray-900">Ticket Management</h2>
                    <button 
                      onClick={handleExportCSV}
                      className="flex items-center gap-2 px-4 py-2 bg-pink-soft text-pink-primary rounded-xl hover:bg-pink-100 transition-colors border border-pink-100 text-xs font-normal"
                    >
                      <FileDown className="w-4 h-4" />
                      Export CSV
                    </button>
                  </div>
                  
                  <div className="flex flex-wrap items-center gap-4">
                    <div className="relative flex-1 min-w-[200px]">
                      <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
                      <input 
                        placeholder="Search tickets..."
                        value={searchTerm}
                        onChange={(e) => setSearchTerm(e.target.value)}
                        className="w-full pl-10 pr-4 py-2 bg-gray-50 border border-gray-200 rounded-lg text-xs focus:ring-2 focus:ring-pink-500 outline-none transition-all"
                      />
                    </div>
                    
                    <div className="flex items-center gap-2">
                      <div className="flex items-center gap-2 bg-gray-50 border border-gray-200 rounded-lg px-3 py-1">
                        <Calendar className="w-3 h-3 text-gray-400" />
                        <input 
                          type="date"
                          value={startDate}
                          onChange={(e) => setStartDate(e.target.value)}
                          className="bg-transparent text-[10px] outline-none text-gray-600"
                          placeholder="Start Date"
                        />
                        <span className="text-gray-300">|</span>
                        <input 
                          type="date"
                          value={endDate}
                          onChange={(e) => setEndDate(e.target.value)}
                          className="bg-transparent text-[10px] outline-none text-gray-600"
                          placeholder="End Date"
                        />
                      </div>
                    </div>

                    <select 
                      value={filterStatus}
                      onChange={(e) => setFilterStatus(e.target.value)}
                      className="px-4 py-2 bg-gray-50 border border-gray-200 rounded-lg text-xs outline-none"
                    >
                      <option value="All">All Status</option>
                      <option value="Open">Open</option>
                      <option value="In Progress">In Progress</option>
                      <option value="Resolved">Resolved</option>
                      <option value="Paused">Paused</option>
                    </select>
                    
                    <select 
                      value={filterPriority}
                      onChange={(e) => setFilterPriority(e.target.value)}
                      className="px-4 py-2 bg-gray-50 border border-gray-200 rounded-lg text-xs outline-none"
                    >
                      <option value="All">All Priority</option>
                      <option value="Low">Low</option>
                      <option value="Medium">Medium</option>
                      <option value="High">High</option>
                      <option value="Urgent">Urgent</option>
                    </select>
                  </div>
                </div>

                <div className="overflow-x-auto">
                  <table className="w-full text-left">
                    <thead>
                      <tr className="bg-gray-50 text-gray-500 text-[10px] uppercase tracking-wider font-normal">
                        <th className="px-6 py-4">Ticket ID</th>
                        <th className="px-6 py-4">User</th>
                        <th className="px-6 py-4">Category</th>
                        <th className="px-6 py-4">Priority</th>
                        <th className="px-6 py-4">Status</th>
                        <th className="px-6 py-4">Assigned To</th>
                        <th className="px-6 py-4">Created</th>
                        <th className="px-6 py-4"></th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100">
                      {paginatedTickets.map((ticket) => (
                        <tr 
                          key={ticket.id} 
                          onClick={() => setSelectedTicket(ticket)}
                          className={cn(
                            "hover:bg-gray-50 cursor-pointer transition-colors",
                            selectedTicket?.id === ticket.id && "bg-pink-soft"
                          )}
                        >
                          <td className="px-6 py-4 font-mono text-xs font-normal text-pink-primary">{ticket.ticketId}</td>
                          <td className="px-6 py-4">
                            <div className="flex flex-col">
                              <span className="text-xs font-normal text-gray-900">{ticket.name}</span>
                              <span className="text-[10px] text-gray-500">{ticket.email}</span>
                            </div>
                          </td>
                          <td className="px-6 py-4">
                            <span className="px-2 py-1 bg-gray-100 text-gray-600 rounded text-[10px] font-normal">
                              {ticket.category}
                            </span>
                          </td>
                          <td className="px-6 py-4">
                            <span className={cn(
                              "px-2 py-1 rounded text-[10px] font-normal",
                              ticket.priority === 'Urgent' ? "bg-red-50 text-red-600" :
                              ticket.priority === 'High' ? "bg-orange-50 text-orange-600" :
                              ticket.priority === 'Medium' ? "bg-pink-soft text-pink-primary" :
                              "bg-gray-50 text-gray-600"
                            )}>
                              {ticket.priority}
                            </span>
                          </td>
                          <td className="px-6 py-4">
                            <span className={cn(
                              "px-2 py-1 rounded-full text-[10px] font-normal",
                              ticket.status === 'Open' ? "bg-gray-50 text-gray-600" :
                              ticket.status === 'In Progress' ? "bg-pink-soft text-pink-primary" :
                              ticket.status === 'Resolved' ? "bg-green-50 text-green-600" :
                              "bg-orange-50 text-orange-600"
                            )}>
                              {ticket.status}
                            </span>
                          </td>
                          <td className="px-6 py-4">
                            <div className="flex flex-col">
                              <span className="text-[10px] font-normal text-gray-900">
                                {ticket.assignedAdminName || 'Unassigned'}
                              </span>
                              {ticket.assignedAdminId && (
                                <span className="text-[8px] text-gray-400 uppercase tracking-tighter">AI Assigned</span>
                              )}
                            </div>
                          </td>
                          <td className="px-6 py-4 text-[10px] text-gray-500">
                            {formatDate(ticket.createdAt, 'MMM d, HH:mm')}
                          </td>
                          <td className="px-6 py-4">
                            <ChevronRight className="w-4 h-4 text-gray-400" />
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>

                {/* Pagination Controls */}
                {totalPages > 1 && (
                  <div className="p-4 border-t border-gray-100 flex items-center justify-between bg-gray-50/50">
                    <div className="text-[10px] text-gray-500 font-normal">
                      Showing <span className="font-medium text-gray-900">{(currentPage - 1) * TICKETS_PER_PAGE + 1}</span> to <span className="font-medium text-gray-900">{Math.min(currentPage * TICKETS_PER_PAGE, filteredTickets.length)}</span> of <span className="font-medium text-gray-900">{filteredTickets.length}</span> tickets
                    </div>
                    <div className="flex items-center gap-1">
                      <button
                        onClick={() => setCurrentPage(prev => Math.max(prev - 1, 1))}
                        disabled={currentPage === 1}
                        className="p-2 rounded-lg hover:bg-white border border-transparent hover:border-gray-200 disabled:opacity-30 disabled:hover:bg-transparent disabled:hover:border-transparent transition-all"
                      >
                        <ChevronLeft className="w-4 h-4 text-gray-600" />
                      </button>
                      
                      <div className="flex items-center gap-1">
                        {Array.from({ length: totalPages }, (_, i) => i + 1).map((page) => {
                          // Show first, last, and pages around current
                          if (
                            page === 1 || 
                            page === totalPages || 
                            (page >= currentPage - 1 && page <= currentPage + 1)
                          ) {
                            return (
                              <button
                                key={page}
                                onClick={() => setCurrentPage(page)}
                                className={cn(
                                  "w-8 h-8 rounded-lg text-xs font-normal transition-all border",
                                  currentPage === page 
                                    ? "bg-black text-white border-black shadow-sm" 
                                    : "bg-white text-gray-600 border-gray-200 hover:border-black"
                                )}
                              >
                                {page}
                              </button>
                            );
                          } else if (
                            page === currentPage - 2 || 
                            page === currentPage + 2
                          ) {
                            return <span key={page} className="text-gray-400 text-xs px-1">...</span>;
                          }
                          return null;
                        })}
                      </div>

                      <button
                        onClick={() => setCurrentPage(prev => Math.min(prev + 1, totalPages))}
                        disabled={currentPage === totalPages}
                        className="p-2 rounded-lg hover:bg-white border border-transparent hover:border-gray-200 disabled:opacity-30 disabled:hover:bg-transparent disabled:hover:border-transparent transition-all"
                      >
                        <ChevronRight className="w-4 h-4 text-gray-600" />
                      </button>
                    </div>
                  </div>
                )}
              </div>
            </div>

            {/* Ticket Detail Sidebar */}
            <div className="lg:col-span-1">
              {selectedTicket ? (
                <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden sticky top-6">
                  <div className="p-6 border-b border-gray-100 flex items-center justify-between">
                    <h3 className="font-normal text-gray-900">Ticket Details</h3>
                    <div className="flex items-center gap-3">
                      <button
                        onClick={() => setIsEditing(!isEditing)}
                        className={cn(
                          "flex items-center gap-1.5 px-4 py-2 rounded-xl text-xs font-normal transition-all border",
                          isEditing 
                            ? "bg-gray-50 text-gray-500 border-gray-200 hover:bg-gray-100" 
                            : "bg-pink-soft text-pink-primary border-pink-100 hover:bg-pink-100"
                        )}
                      >
                        {isEditing ? (
                          <>Cancel</>
                        ) : (
                          <>
                            <Edit3 className="w-4 h-4" />
                            Edit Ticket
                          </>
                        )}
                      </button>
                      <span className="text-[10px] font-mono text-gray-400">{selectedTicket.ticketId}</span>
                    </div>
                  </div>
                  
                  <div className="p-6 space-y-6 max-h-[calc(100vh-200px)] overflow-y-auto">
                    <div className="space-y-4">
                      <div>
                        <h4 className="text-[10px] font-normal text-gray-400 uppercase tracking-wider mb-2">Subject</h4>
                        {isEditing ? (
                          <input 
                            type="text"
                            value={editSubject}
                            onChange={(e) => setEditSubject(e.target.value)}
                            className="w-full px-3 py-2 bg-gray-50 border border-gray-200 rounded-lg text-xs outline-none focus:ring-2 focus:ring-pink-500"
                          />
                        ) : (
                          <p className="text-sm font-normal text-gray-900">{selectedTicket.subject}</p>
                        )}
                      </div>
                      
                      <div className="grid grid-cols-2 gap-4">
                        <div>
                          <h4 className="text-[10px] font-normal text-gray-400 uppercase tracking-wider mb-2">Status</h4>
                          {isEditing ? (
                            <select 
                              value={editStatus}
                              onChange={(e) => setEditStatus(e.target.value as TicketStatus)}
                              className="w-full px-3 py-2 bg-gray-50 border border-gray-200 rounded-lg text-xs outline-none focus:ring-2 focus:ring-pink-500"
                            >
                              <option value="Open">Open</option>
                              <option value="In Progress">In Progress</option>
                              <option value="Resolved">Resolved</option>
                              <option value="Paused">Paused</option>
                            </select>
                          ) : (
                            <span className={cn(
                              "px-2 py-1 rounded-full text-[10px] font-normal",
                              selectedTicket.status === 'Open' ? "bg-gray-50 text-gray-600" :
                              selectedTicket.status === 'In Progress' ? "bg-pink-soft text-pink-primary" :
                              selectedTicket.status === 'Resolved' ? "bg-green-50 text-green-600" :
                              "bg-orange-50 text-orange-600"
                            )}>
                              {selectedTicket.status}
                            </span>
                          )}
                        </div>

                        <div>
                          <h4 className="text-[10px] font-normal text-gray-400 uppercase tracking-wider mb-2">Priority</h4>
                          {isEditing ? (
                            <select 
                              value={editPriority}
                              onChange={(e) => setEditPriority(e.target.value as TicketPriority)}
                              className="w-full px-3 py-2 bg-gray-50 border border-gray-200 rounded-lg text-xs outline-none focus:ring-2 focus:ring-pink-500"
                            >
                              <option value="Low">Low</option>
                              <option value="Medium">Medium</option>
                              <option value="High">High</option>
                              <option value="Urgent">Urgent</option>
                            </select>
                          ) : (
                            <span className={cn(
                              "px-2 py-1 rounded text-[10px] font-normal",
                              selectedTicket.priority === 'Urgent' ? "bg-red-50 text-red-600" :
                              selectedTicket.priority === 'High' ? "bg-orange-50 text-orange-600" :
                              selectedTicket.priority === 'Medium' ? "bg-pink-soft text-pink-primary" :
                              "bg-gray-50 text-gray-600"
                            )}>
                              {selectedTicket.priority}
                            </span>
                          )}
                        </div>
                      </div>

                      <div>
                        <h4 className="text-[10px] font-normal text-gray-400 uppercase tracking-wider mb-2">Assigned To</h4>
                        <div className="flex items-center gap-2 p-3 bg-gray-50 rounded-xl border border-gray-100">
                          <div className={cn(
                            "w-8 h-8 rounded-lg flex items-center justify-center text-xs font-normal",
                            selectedTicket.assignedAdminId ? "bg-pink-soft text-pink-primary" : "bg-white text-gray-400"
                          )}>
                            {selectedTicket.assignedAdminName ? selectedTicket.assignedAdminName.charAt(0) : '?'}
                          </div>
                          <div>
                            <p className="text-xs font-normal text-gray-900">{selectedTicket.assignedAdminName || 'Unassigned'}</p>
                            {selectedTicket.assignedAdminId && (
                              <p className="text-[8px] text-pink-primary uppercase tracking-widest flex items-center gap-1">
                                <Sparkles className="w-2 h-2" />
                                AI Assigned
                              </p>
                            )}
                          </div>
                        </div>
                      </div>

                      <div>
                        <h4 className="text-[10px] font-normal text-gray-400 uppercase tracking-wider mb-2">Category</h4>
                        {isEditing ? (
                          <select 
                            value={editCategory}
                            onChange={(e) => setEditCategory(e.target.value as TicketCategory)}
                            className="w-full px-3 py-2 bg-gray-50 border border-gray-200 rounded-lg text-xs outline-none focus:ring-2 focus:ring-pink-500"
                          >
                            <option value="General">General</option>
                            <option value="Technical">Technical</option>
                            <option value="HR">HR</option>
                            <option value="Payments">Payments</option>
                            <option value="Other">Other</option>
                            <option value="Missing Cases">Missing Cases</option>
                          </select>
                        ) : (
                          <span className="px-2 py-1 bg-gray-100 text-gray-600 rounded text-[10px] font-normal">
                            {selectedTicket.category}
                          </span>
                        )}
                      </div>

                      {selectedTicket.aiSummary && !isEditing && (
                        <div className="p-4 bg-pink-soft rounded-xl border border-pink-100">
                          <h4 className="text-[10px] font-normal text-pink-primary uppercase tracking-widest mb-2 flex items-center gap-2">
                            <Sparkles className="w-3 h-3" />
                            AI Summary
                          </h4>
                          <p className="text-xs text-gray-700 italic">"{selectedTicket.aiSummary}"</p>
                        </div>
                      )}
                      <div>
                        <h4 className="text-[10px] font-normal text-gray-400 uppercase tracking-wider mb-2">Description</h4>
                        {isEditing ? (
                          <textarea 
                            value={editDescription}
                            onChange={(e) => setEditDescription(e.target.value)}
                            className="w-full px-3 py-2 bg-gray-50 border border-gray-200 rounded-lg text-xs outline-none focus:ring-2 focus:ring-pink-500 resize-none"
                            rows={5}
                          />
                        ) : (
                          <p className="text-xs text-gray-600 leading-relaxed">{selectedTicket.description}</p>
                        )}
                      </div>

                      {isEditing && (
                        <div>
                          <h4 className="text-[10px] font-normal text-gray-400 uppercase tracking-wider mb-2">Admin Comment (Internal)</h4>
                          <textarea 
                            value={editAdminComment}
                            onChange={(e) => setEditAdminComment(e.target.value)}
                            className="w-full px-3 py-2 bg-gray-50 border border-gray-200 rounded-lg text-xs outline-none focus:ring-2 focus:ring-pink-500 resize-none"
                            rows={3}
                            placeholder="Add or update the internal admin comment..."
                          />
                        </div>
                      )}

                      {isEditing && (
                        <button
                          onClick={handleUpdateTicket}
                          disabled={isSaving}
                          className="w-full py-2.5 bg-black text-white rounded-xl text-xs font-normal hover:bg-opacity-90 transition-all shadow-lg shadow-black/10 flex items-center justify-center gap-2"
                        >
                          {isSaving ? (
                            <div className="w-4 h-4 border-2 border-white/20 border-t-white rounded-full animate-spin" />
                          ) : (
                            <CheckCircle2 className="w-4 h-4" />
                          )}
                          Save Changes
                        </button>
                      )}
                    </div>

                    {selectedTicket.category === 'Missing Cases' && (
                      <div className="p-4 bg-pink-soft rounded-xl border border-pink-100 space-y-4">
                        <h4 className="text-xs font-normal text-pink-primary flex items-center gap-2">
                          <AlertCircle className="w-4 h-4" />
                          Missing Case Info
                        </h4>
                        {selectedTicket.imageUrl && (
                          <img src={selectedTicket.imageUrl} alt="Missing" className="w-full h-48 object-cover rounded-lg" />
                        )}
                        <div className="grid grid-cols-2 gap-4 text-[10px]">
                          <div>
                            <p className="text-pink-primary font-normal uppercase">Last Seen</p>
                            <p className="text-gray-900">{selectedTicket.location?.lastSeenLocation || 'N/A'}</p>
                          </div>
                          <div>
                            <p className="text-pink-primary font-normal uppercase">Date</p>
                            <p className="text-gray-900">{selectedTicket.dateOfMissing || 'N/A'}</p>
                          </div>
                        </div>
                        {selectedTicket.location && (
                          <a 
                            href={`https://www.google.com/maps?q=${selectedTicket.location.lat},${selectedTicket.location.lng}`}
                            target="_blank"
                            rel="noreferrer"
                            className="flex items-center justify-center gap-2 w-full py-2 bg-white border border-pink-200 rounded-lg text-[10px] font-normal text-pink-primary hover:bg-pink-50 transition-colors"
                          >
                            <MapPin className="w-3 h-3" />
                            View on Google Maps
                          </a>
                        )}
                      </div>
                    )}

                    <div className="space-y-4">
                      <h4 className="text-[10px] font-normal text-gray-400 uppercase tracking-wider flex items-center gap-2">
                        <History className="w-3 h-3" />
                        Timeline
                      </h4>
                      <div className="space-y-4 border-l-2 border-gray-100 ml-2 pl-4">
                        {selectedTicket.timeline.map((entry, idx) => (
                          <div key={idx} className="relative">
                            <div className={cn(
                              "absolute -left-[21px] top-1 w-2 h-2 rounded-full",
                              entry.status === 'Resolved' ? "bg-green-500" :
                              entry.status === 'In Progress' ? "bg-pink-primary" :
                              "bg-gray-400"
                            )} />
                            <p className="text-[10px] font-normal text-gray-900">{entry.status}</p>
                            <p className="text-[10px] text-gray-500">{entry.message}</p>
                            <p className="text-[8px] text-gray-400 mt-1">{formatDate(entry.updatedAt, 'MMM d, HH:mm')}</p>
                          </div>
                        ))}
                      </div>
                    </div>

                    <div className="space-y-4 pt-4 border-t border-gray-100">
                      <h4 className="text-[10px] font-normal text-gray-400 uppercase tracking-wider flex items-center gap-2">
                        <MessageSquare className="w-3 h-3" />
                        Admin Comment
                      </h4>
                      {selectedTicket.adminComment ? (
                        <div className="p-3 bg-pink-soft/30 border border-pink-100/50 rounded-xl">
                          <p className="text-xs text-gray-700 leading-relaxed italic">"{selectedTicket.adminComment}"</p>
                        </div>
                      ) : (
                        <p className="text-[10px] text-gray-400 italic">No admin comment yet.</p>
                      )}
                    </div>

                    <div className="space-y-4 pt-4 border-t border-gray-100">
                      <h4 className="text-[10px] font-normal text-gray-400 uppercase tracking-wider flex items-center gap-2">
                        <MessageSquare className="w-3 h-3" />
                        Admin Actions
                      </h4>
                      <textarea 
                        placeholder="Add a comment for the user..."
                        value={adminComment}
                        onChange={(e) => setAdminComment(e.target.value)}
                        className="w-full px-4 py-2 bg-gray-50 border border-gray-200 rounded-lg text-xs outline-none focus:ring-2 focus:ring-pink-500 resize-none"
                        rows={3}
                      />
                      <div className="grid grid-cols-2 gap-2">
                        <button 
                          onClick={() => handlePass(selectedTicket)}
                          className="flex items-center justify-center gap-2 p-3 bg-gray-50 text-gray-600 rounded-xl hover:bg-gray-100 transition-colors border border-gray-100"
                        >
                          <ArrowRightCircle className="w-4 h-4" />
                          <span className="text-[10px] font-normal uppercase tracking-widest">Pass</span>
                        </button>
                        <button 
                          onClick={() => handleStatusUpdate(selectedTicket, 'In Progress')}
                          className="flex items-center justify-center gap-2 p-3 bg-pink-soft text-pink-primary rounded-xl hover:bg-pink-100 transition-colors border border-pink-100"
                        >
                          <PlayCircle className="w-4 h-4" />
                          <span className="text-[10px] font-normal uppercase tracking-widest">Process</span>
                        </button>
                        <button 
                          onClick={() => handleStatusUpdate(selectedTicket, 'Paused')}
                          className="flex items-center justify-center gap-2 p-3 bg-orange-50 text-orange-600 rounded-xl hover:bg-orange-100 transition-colors border border-orange-100"
                        >
                          <PauseCircle className="w-4 h-4" />
                          <span className="text-[10px] font-normal uppercase tracking-widest">Pause</span>
                        </button>
                        <button 
                          onClick={() => handleStatusUpdate(selectedTicket, 'Resolved')}
                          className="flex items-center justify-center gap-2 p-3 bg-green-50 text-green-600 rounded-xl hover:bg-green-100 transition-colors border border-green-100"
                        >
                          <CheckCircle2 className="w-4 h-4" />
                          <span className="text-[10px] font-normal uppercase tracking-widest">Resolve</span>
                        </button>
                        <button 
                          onClick={() => handleTrigger(selectedTicket)}
                          className="flex items-center justify-center gap-2 p-3 bg-black text-white rounded-xl hover:bg-opacity-90 transition-all shadow-lg shadow-black/10"
                        >
                          <Zap className="w-4 h-4" />
                          <span className="text-[10px] font-normal uppercase tracking-widest">Trigger</span>
                        </button>
                      </div>
                    </div>

                    {/* Chat Section */}
                    <div className="pt-6 border-t border-gray-100">
                      <Chat ticketId={selectedTicket.id} profile={profile} />
                    </div>
                  </div>
                </div>
              ) : (
                <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-12 text-center">
                  <div className="flex justify-center mb-4">
                    <BarChart3 className="w-12 h-12 text-gray-200" />
                  </div>
                  <h3 className="text-sm font-normal text-gray-900">No Ticket Selected</h3>
                  <p className="text-xs text-gray-500 mt-2">Select a ticket from the list to view details and take actions.</p>
                </div>
              )}
            </div>
          </div>
        </>
      )}

      {activeTab === 'analytics' && <AdminAnalytics tickets={tickets} />}
      
      {activeTab === 'users' && (
        <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
          <div className="flex items-center justify-between">
            <h2 className="text-xl font-normal text-black tracking-tight">User Management</h2>
            <div className="text-xs text-gray-400 font-normal">
              Total Users: {users.length}
            </div>
          </div>

          <div className="bg-white rounded-3xl border border-gray-100 shadow-sm overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="bg-gray-50 border-b border-gray-100">
                    <th className="px-6 py-4 text-[10px] font-normal text-gray-400 uppercase tracking-widest">User</th>
                    <th className="px-6 py-4 text-[10px] font-normal text-gray-400 uppercase tracking-widest">Email</th>
                    <th className="px-6 py-4 text-[10px] font-normal text-gray-400 uppercase tracking-widest">Department</th>
                    <th className="px-6 py-4 text-[10px] font-normal text-gray-400 uppercase tracking-widest">Role</th>
                    <th className="px-6 py-4 text-[10px] font-normal text-gray-400 uppercase tracking-widest text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-50">
                  {users.map((u) => (
                    <tr key={u.uid} className="hover:bg-gray-50/50 transition-colors">
                      <td className="px-6 py-4">
                        <div className="flex items-center gap-3">
                          <div className="w-8 h-8 bg-pink-soft rounded-lg flex items-center justify-center text-pink-primary font-normal text-xs">
                            {u.name.charAt(0)}
                          </div>
                          <span className="text-sm font-normal text-black">{u.name}</span>
                        </div>
                      </td>
                      <td className="px-6 py-4 text-sm text-gray-500 font-normal">{u.email}</td>
                      <td className="px-6 py-4 text-sm text-gray-500 font-normal">{u.department || '-'}</td>
                      <td className="px-6 py-4">
                        <span className={cn(
                          "px-2.5 py-1 rounded-full text-[10px] font-normal uppercase tracking-wider",
                          u.role === 'admin' ? "bg-pink-primary/10 text-pink-primary" : "bg-gray-100 text-gray-500"
                        )}>
                          {u.role}
                        </span>
                      </td>
                      <td className="px-6 py-4 text-right">
                        <div className="flex items-center justify-end gap-2">
                          <button
                            onClick={() => handleRoleUpdate(u.uid, u.role === 'admin' ? 'user' : 'admin')}
                            className="p-2 hover:bg-white rounded-lg text-gray-400 hover:text-pink-primary transition-all border border-transparent hover:border-gray-100"
                            title={`Make ${u.role === 'admin' ? 'User' : 'Admin'}`}
                          >
                            <ShieldCheck className="w-4 h-4" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {activeTab === 'settings' && <AdminSettings profile={profile} />}
    </div>
  );
}
