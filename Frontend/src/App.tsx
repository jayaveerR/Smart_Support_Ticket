/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect } from 'react';
import { Routes, Route, useNavigate, useLocation, Navigate } from 'react-router-dom';
import TicketForm from './components/TicketForm';
import AdminDashboard from './components/AdminDashboard';
import TicketTracking from './components/TicketTracking';
import UserEnrollment from './components/UserEnrollment';
import { 
  LayoutDashboard, Ticket as TicketIcon, Search, ShieldCheck, 
  LogIn, LogOut, User as UserIcon, Loader2, AlertCircle,
  ArrowRight, Info, Heart, Sparkles, Zap
} from 'lucide-react';
import { cn } from './lib/utils';
import { auth, googleProvider, signInWithPopup, signOut, onAuthStateChanged, db, getDoc, doc } from './lib/firebase';
import { getDocFromServer } from 'firebase/firestore';
import { UserProfile } from './types';

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

type View = 'user' | 'admin' | 'track';

export default function App() {
  const navigate = useNavigate();
  const location = useLocation();
  const [user, setUser] = useState<any>(null);
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [needsEnrollment, setNeedsEnrollment] = useState(false);
  const [showProfileModal, setShowProfileModal] = useState(false);

  // Determine view based on path
  const view = location.pathname === '/admin' ? 'admin' : location.pathname === '/track' ? 'track' : 'user';

  useEffect(() => {
    // Test Firestore connection
    const testConnection = async () => {
      try {
        await getDocFromServer(doc(db, 'test', 'connection'));
      } catch (error) {
        if (error instanceof Error && error.message.includes('the client is offline')) {
          console.error("Please check your Firebase configuration.");
        }
      }
    };
    testConnection();

    const unsubscribe = onAuthStateChanged(auth, async (currentUser) => {
      setUser(currentUser);
      if (currentUser) {
        const docRef = doc(db, 'users', currentUser.uid);
        try {
          const docSnap = await getDoc(docRef);
          if (docSnap.exists()) {
            const data = docSnap.data() as UserProfile;
            if (currentUser.email === 'ramanadhamjayaveer@mictech.edu.in' && data.role !== 'admin') {
              data.role = 'admin';
            }
            setProfile(data);
            setNeedsEnrollment(false);
          } else {
            setNeedsEnrollment(true);
          }
        } catch (err) {
          handleFirestoreError(err, OperationType.GET, `users/${currentUser.uid}`);
        }
      } else {
        setProfile(null);
        setNeedsEnrollment(false);
      }
      setLoading(false);
    });
    return () => unsubscribe();
  }, []);

  const [loginError, setLoginError] = useState<string | null>(null);

  const handleLogin = async () => {
    setLoginError(null);
    try {
      await signInWithPopup(auth, googleProvider);
    } catch (error: any) {
      console.error('Login error:', error);
      if (error.code === 'auth/unauthorized-domain') {
        setLoginError('This domain is not authorized in Firebase. Please add the app domains to your Firebase Console.');
      } else {
        setLoginError(error.message || 'An error occurred during login.');
      }
    }
  };

  const handleLogout = async () => {
    try {
      await signOut(auth);
      navigate('/');
    } catch (error) {
      console.error('Logout error:', error);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <Loader2 className="w-12 h-12 text-blue-600 animate-spin" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-white flex flex-col font-sans">
      {/* Navigation Bar - White Theme */}
      <nav className="bg-white border-b border-gray-100 sticky top-0 z-50 backdrop-blur-md bg-opacity-95">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between h-16 items-center">
            <div className="flex items-center gap-2 cursor-pointer" onClick={() => navigate('/')}>
              <div className="w-8 h-8 bg-pink-primary rounded-lg flex items-center justify-center shadow-sm">
                <Zap className="w-5 h-5 text-white" />
              </div>
              <span className="text-lg font-normal text-black tracking-tight">
                Smart<span className="text-pink-primary">Support</span>
              </span>
            </div>

            <div className="hidden md:flex items-center gap-1 bg-gray-50 p-1 rounded-xl border border-gray-100">
              <button
                onClick={() => navigate('/')}
                className={cn(
                  "flex items-center gap-2 px-4 py-2 rounded-lg text-xs font-normal transition-all",
                  view === 'user' ? "bg-pink-primary text-white shadow-sm" : "text-gray-500 hover:text-black hover:bg-white"
                )}
              >
                <TicketIcon className="w-3.5 h-3.5" />
                Submit Ticket
              </button>
              <button
                onClick={() => navigate('/track')}
                className={cn(
                  "flex items-center gap-2 px-4 py-2 rounded-lg text-xs font-normal transition-all",
                  view === 'track' ? "bg-pink-primary text-white shadow-sm" : "text-gray-500 hover:text-black hover:bg-white"
                )}
              >
                <Search className="w-3.5 h-3.5" />
                Track Status
              </button>
              {profile?.role === 'admin' && (
                <button
                  onClick={() => navigate('/admin')}
                  className={cn(
                    "flex items-center gap-2 px-4 py-2 rounded-lg text-xs font-normal transition-all",
                    view === 'admin' ? "bg-pink-primary text-white shadow-sm" : "text-gray-500 hover:text-black hover:bg-white"
                  )}
                >
                  <LayoutDashboard className="w-3.5 h-3.5" />
                  Admin Panel
                </button>
              )}
            </div>

            <div className="flex items-center gap-3">
              {user ? (
                <div className="flex items-center gap-2 pl-3 border-l border-gray-100">
                  <div 
                    className="flex items-center gap-2 cursor-pointer group"
                    onClick={() => setShowProfileModal(true)}
                  >
                    <div className="hidden lg:block text-right">
                      <p className="text-xs font-normal text-black leading-none group-hover:text-pink-primary transition-colors">{profile?.name || user.displayName}</p>
                      <p className="text-[9px] font-normal text-pink-primary uppercase tracking-wider mt-0.5">{profile?.role || 'User'}</p>
                    </div>
                    <img 
                      src={user.photoURL || ''} 
                      alt="User" 
                      className="w-8 h-8 rounded-lg border border-pink-primary/20 shadow-sm group-hover:border-pink-primary transition-all"
                    />
                  </div>
                  <button 
                    onClick={handleLogout}
                    className="p-2 bg-gray-50 text-gray-400 rounded-lg hover:bg-red-50 hover:text-red-500 transition-all"
                    title="Logout"
                  >
                    <LogOut className="w-4 h-4" />
                  </button>
                </div>
              ) : (
                <button 
                  onClick={handleLogin}
                  className="flex items-center gap-2 px-4 py-2 bg-black text-white rounded-xl text-xs font-normal hover:bg-opacity-90 transition-all shadow-sm"
                >
                  <LogIn className="w-4 h-4" />
                  Login
                </button>
              )}
            </div>
          </div>
        </div>
      </nav>

      {/* Main Content - Pink Theme Accents */}
      <main className="flex-grow py-12 px-4 sm:px-6 lg:px-8">
        <div className="max-w-7xl mx-auto">
          <Routes>
            <Route path="/" element={
              !user ? (
                <div className="space-y-20">
                  {/* Arrow Section (Hero) */}
                  <div className="text-center py-16 space-y-6 relative">
                    <div className="absolute top-0 left-1/2 -translate-x-1/2 w-48 h-48 bg-pink-primary/5 blur-[80px] rounded-full -z-10"></div>
                    <div className="w-16 h-16 bg-pink-soft rounded-2xl flex items-center justify-center text-pink-primary mx-auto mb-6 shadow-sm animate-bounce">
                      <ArrowRight className="w-8 h-8 rotate-90" />
                    </div>
                    <h1 className="text-4xl md:text-5xl font-normal text-black tracking-tight leading-tight">
                      Smart<span className="text-pink-primary">Support</span> AI
                    </h1>
                    <p className="text-lg text-gray-600 max-w-2xl mx-auto leading-relaxed font-normal">
                      Experience the future of customer service. Powered by <span className="text-black">automation</span> and <span className="text-pink-primary">AI</span>.
                    </p>
                    <div className="flex flex-col sm:flex-row items-center justify-center gap-3 mt-10">
                      <button 
                        onClick={handleLogin}
                        className="px-8 py-4 bg-pink-primary text-white rounded-2xl font-normal text-lg hover:scale-105 transition-all shadow-lg shadow-pink-primary/20 flex items-center gap-2"
                      >
                        <LogIn className="w-5 h-5" />
                        Get Started
                      </button>
                      <a href="#about" className="px-8 py-4 bg-white text-black border border-gray-200 rounded-2xl font-normal text-lg hover:bg-gray-50 transition-all flex items-center gap-2">
                        <div className="w-5 h-5 flex items-center justify-center">
                          <Info className="w-5 h-5" />
                        </div>
                        Learn More
                      </a>
                    </div>

                    {loginError && (
                      <div className="mt-10 p-6 bg-red-50 border border-red-100 rounded-2xl max-w-2xl mx-auto text-left shadow-sm">
                        <div className="flex items-center gap-2 text-red-600 mb-3">
                          <AlertCircle className="w-6 h-6" />
                          <h3 className="text-lg font-normal uppercase tracking-widest">Authentication Error</h3>
                        </div>
                        <p className="text-red-700 font-normal text-base mb-4">{loginError}</p>
                        <div className="bg-white p-3 rounded-lg border border-red-100 space-y-3">
                          <p className="text-gray-600 text-sm">To fix this, go to your <a href="https://console.firebase.google.com/" target="_blank" className="text-blue-600 underline font-normal">Firebase Console</a> &gt; Authentication &gt; Settings &gt; Authorized domains, and add these URLs:</p>
                          <ul className="space-y-2">
                            <li className="font-mono text-xs bg-gray-50 p-2 rounded-lg border border-gray-200 break-all select-all">ais-dev-5jp43yrbryuzjczgf63bzb-560898255652.asia-southeast1.run.app</li>
                            <li className="font-mono text-xs bg-gray-50 p-2 rounded-lg border border-gray-200 break-all select-all">ais-pre-5jp43yrbryuzjczgf63bzb-560898255652.asia-southeast1.run.app</li>
                          </ul>
                        </div>
                      </div>
                    )}
                  </div>

                  {/* About Section */}
                  <section id="about" className="py-20 bg-white rounded-[3rem] px-8 border border-gray-100">
                    <div className="grid grid-cols-1 lg:grid-cols-2 gap-12 items-center">
                      <div className="space-y-6">
                        <div className="inline-flex items-center gap-2 px-3 py-1 bg-pink-primary/5 text-pink-primary rounded-full text-xs font-normal uppercase tracking-widest">
                          <Heart className="w-3 h-3 fill-current" />
                          About Our Mission
                        </div>
                        <h2 className="text-3xl font-normal text-black leading-tight">
                          We're redefining support with <span className="text-pink-primary italic">passion</span> and <span className="text-black">intelligence</span>.
                        </h2>
                        <p className="text-lg text-gray-600 leading-relaxed font-normal">
                          SmartSupport AI isn't just a ticketing system. It's a bridge between complex problems and instant solutions. By combining automation with cutting-edge AI, we ensure every voice is heard and every issue is resolved with precision.
                        </p>
                        <div className="grid grid-cols-2 gap-6">
                          <div className="p-5 bg-white rounded-2xl shadow-sm border border-gray-100">
                            <Sparkles className="w-8 h-8 text-pink-primary mb-3" />
                            <h4 className="text-base font-normal mb-1">AI Summaries</h4>
                            <p className="text-xs text-gray-500">Instant insights for every ticket submitted.</p>
                          </div>
                          <div className="p-5 bg-white rounded-2xl shadow-sm border border-gray-100">
                            <Zap className="w-8 h-8 text-black mb-3" />
                            <h4 className="text-base font-normal mb-1">Automated</h4>
                            <p className="text-xs text-gray-500">Seamless automation workflows for speed.</p>
                          </div>
                        </div>
                      </div>
                      <div className="relative">
                        <div className="aspect-square bg-gray-50 rounded-[2rem] shadow-xl overflow-hidden">
                          <img 
                            src="https://picsum.photos/seed/support/800/800" 
                            alt="Support Team" 
                            className="w-full h-full object-cover grayscale hover:grayscale-0 transition-all duration-700"
                            referrerPolicy="no-referrer"
                          />
                        </div>
                        <div className="absolute -bottom-6 -left-6 p-6 bg-white rounded-2xl shadow-xl border border-gray-100 max-w-xs">
                          <p className="text-pink-primary font-normal text-3xl mb-1">99.9%</p>
                          <p className="text-gray-500 font-normal uppercase tracking-widest text-[10px]">Customer Satisfaction Rate</p>
                        </div>
                      </div>
                    </div>
                  </section>
                </div>
              ) : needsEnrollment ? (
                <UserEnrollment onComplete={(p) => { setProfile(p); setNeedsEnrollment(false); }} />
              ) : (
                <TicketForm profile={profile} />
              )
            } />
            <Route path="/track" element={<TicketTracking profile={profile} />} />
            <Route path="/admin" element={
              profile?.role === 'admin' ? (
                <AdminDashboard profile={profile} />
              ) : (
                <div className="text-center py-20">
                  <AlertCircle className="w-16 h-16 text-red-500 mx-auto mb-4" />
                  <h2 className="text-2xl font-normal">Access Denied</h2>
                  <p className="text-gray-500">You do not have permission to view the admin panel.</p>
                </div>
              )
            } />
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </div>
      </main>

      {/* Profile Details Modal */}
      {showProfileModal && profile && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm">
          <div className="bg-white w-full max-w-sm rounded-3xl shadow-2xl border border-gray-100 overflow-hidden animate-in fade-in zoom-in duration-200">
            <div className="relative h-24 bg-pink-soft">
              <button 
                onClick={() => setShowProfileModal(false)}
                className="absolute top-4 right-4 p-2 bg-white/80 hover:bg-white rounded-full text-gray-500 transition-all shadow-sm"
              >
                <LogOut className="w-4 h-4 rotate-180" />
              </button>
            </div>
            <div className="px-8 pb-8 -mt-12">
              <div className="flex flex-col items-center text-center">
                <img 
                  src={user?.photoURL || ''} 
                  alt="Profile" 
                  className="w-24 h-24 rounded-2xl border-4 border-white shadow-lg mb-4"
                />
                <h3 className="text-xl font-normal text-black">{profile.name}</h3>
                <p className="text-[10px] font-normal text-pink-primary uppercase tracking-widest mt-1 bg-pink-soft px-3 py-1 rounded-full">
                  {profile.role}
                </p>
              </div>

              <div className="mt-8 space-y-4">
                <div className="flex items-center gap-4 p-3 bg-gray-50 rounded-xl border border-gray-100">
                  <div className="w-8 h-8 bg-white rounded-lg flex items-center justify-center text-gray-400 shadow-sm">
                    <LogIn className="w-4 h-4" />
                  </div>
                  <div className="flex-grow">
                    <p className="text-[9px] text-gray-400 uppercase tracking-widest leading-none mb-1">Email Address</p>
                    <p className="text-xs text-black font-normal truncate">{profile.email}</p>
                  </div>
                </div>

                <div className="flex items-center gap-4 p-3 bg-gray-50 rounded-xl border border-gray-100">
                  <div className="w-8 h-8 bg-white rounded-lg flex items-center justify-center text-gray-400 shadow-sm">
                    <UserIcon className="w-4 h-4" />
                  </div>
                  <div className="flex-grow">
                    <p className="text-[9px] text-gray-400 uppercase tracking-widest leading-none mb-1">Phone Number</p>
                    <p className="text-xs text-black font-normal">{profile.phone || 'Not provided'}</p>
                  </div>
                </div>

                <div className="flex items-center gap-4 p-3 bg-gray-50 rounded-xl border border-gray-100">
                  <div className="w-8 h-8 bg-white rounded-lg flex items-center justify-center text-gray-400 shadow-sm">
                    <LayoutDashboard className="w-4 h-4" />
                  </div>
                  <div className="flex-grow">
                    <p className="text-[9px] text-gray-400 uppercase tracking-widest leading-none mb-1">Department</p>
                    <p className="text-xs text-black font-normal">{profile.department || 'Not provided'}</p>
                  </div>
                </div>
              </div>

              <button 
                onClick={() => setShowProfileModal(false)}
                className="w-full mt-8 py-3 bg-black text-white rounded-xl text-xs font-normal hover:bg-opacity-90 transition-all shadow-lg shadow-black/10"
              >
                Close Profile
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Footer - White Theme */}
      <footer className="bg-white text-black py-12 border-t border-gray-100">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="grid grid-cols-1 md:grid-cols-4 gap-10">
            <div className="col-span-1 md:col-span-2 space-y-4">
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 bg-pink-primary rounded-lg flex items-center justify-center">
                  <Zap className="w-5 h-5 text-white" />
                </div>
                <span className="text-lg font-normal tracking-tight">
                  Smart<span className="text-pink-primary">Support</span>
                </span>
              </div>
              <p className="text-gray-500 max-w-md leading-relaxed text-sm font-normal">
                Empowering teams with AI-driven support automation. Built for speed, designed for precision, and powered by the most versatile automation engine.
              </p>
              <div className="flex gap-3">
                {['Twitter', 'GitHub', 'LinkedIn'].map(social => (
                  <a key={social} href="#" className="w-8 h-8 bg-gray-50 rounded-lg flex items-center justify-center hover:bg-pink-primary hover:text-white transition-all text-gray-400">
                    <span className="sr-only">{social}</span>
                    <div className="w-4 h-4 bg-current rounded-full"></div>
                  </a>
                ))}
              </div>
            </div>
            <div>
              <h4 className="text-xs font-normal mb-4 text-pink-primary uppercase tracking-widest">Platform</h4>
              <ul className="space-y-2 text-gray-500 text-xs font-normal">
                <li><button onClick={() => navigate('/')} className="hover:text-pink-primary transition-colors">Submit Ticket</button></li>
                <li><button onClick={() => navigate('/track')} className="hover:text-pink-primary transition-colors">Track Status</button></li>
                <li><a href="#about" className="hover:text-pink-primary transition-colors">About Us</a></li>
                <li><a href="#" className="hover:text-pink-primary transition-colors">Documentation</a></li>
              </ul>
            </div>
            <div>
              <h4 className="text-xs font-normal mb-4 text-black uppercase tracking-widest">Support</h4>
              <ul className="space-y-2 text-gray-500 text-xs font-normal">
                <li><a href="#" className="hover:text-pink-primary transition-colors">Help Center</a></li>
                <li><a href="#" className="hover:text-pink-primary transition-colors">Privacy Policy</a></li>
                <li><a href="#" className="hover:text-pink-primary transition-colors">Terms of Service</a></li>
                <li><a href="#" className="hover:text-pink-primary transition-colors">Contact Sales</a></li>
              </ul>
            </div>
          </div>
          <div className="mt-12 pt-6 border-t border-gray-50 flex flex-col md:flex-row justify-between items-center gap-4">
            <p className="text-gray-400 text-[10px] font-normal">
              © 2026 SmartSupport AI. All rights reserved.
            </p>
            <div className="flex items-center gap-1.5 text-[10px] font-normal text-gray-400">
              Made with <Heart className="w-3 h-3 text-pink-primary fill-current" /> by the SmartSupport Team
            </div>
          </div>
        </div>
      </footer>
    </div>
  );
}


