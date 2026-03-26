import React, { useState, useEffect } from 'react';
import { db, auth } from '../lib/firebase';
import { doc, getDoc, setDoc } from 'firebase/firestore';
import { SystemSettings, UserProfile } from '../types';
import { Save, Shield, Mail, ToggleLeft, ToggleRight, AlertTriangle, Loader2 } from 'lucide-react';
import { cn } from '../lib/utils';

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

export default function AdminSettings({ profile }: { profile: UserProfile }) {
  const [settings, setSettings] = useState<SystemSettings>({
    id: 'default',
    autoAssignment: true,
    maintenanceMode: false,
    notificationEmail: 'admin@smartsupport.ai',
    maxTicketsPerUser: 5,
    updatedAt: Date.now(),
    updatedBy: profile.uid
  });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<{ type: 'success' | 'error', text: string } | null>(null);

  useEffect(() => {
    const fetchSettings = async () => {
      try {
        const docRef = doc(db, 'settings', 'default');
        const docSnap = await getDoc(docRef);
        if (docSnap.exists()) {
          setSettings(docSnap.data() as SystemSettings);
        } else {
          // If settings don't exist, create them
          const initialSettings = {
            ...settings,
            updatedAt: Date.now(),
            updatedBy: profile.uid
          };
          await setDoc(docRef, initialSettings);
          setSettings(initialSettings);
        }
      } catch (error: any) {
        console.error('Error fetching settings:', error);
        if (error.code === 'permission-denied') {
          setMessage({ type: 'error', text: 'You do not have permission to view or modify settings. Please ensure your account is an admin.' });
        } else {
          try {
            handleFirestoreError(error, OperationType.GET, 'settings/default');
          } catch (err) {
            // Error already logged
          }
        }
      } finally {
        setLoading(false);
      }
    };
    fetchSettings();
  }, []);

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setMessage(null);
    try {
      const updatedSettings = {
        ...settings,
        updatedAt: Date.now(),
        updatedBy: profile.uid
      };
      await setDoc(doc(db, 'settings', 'default'), updatedSettings);
      setSettings(updatedSettings);
      setMessage({ type: 'success', text: 'Settings updated successfully' });
    } catch (error) {
      console.error('Error saving settings:', error);
      setMessage({ type: 'error', text: 'Failed to update settings' });
      try {
        handleFirestoreError(error, OperationType.WRITE, 'settings/default');
      } catch (err) {
        // Error already logged
      }
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center p-20">
        <Loader2 className="w-8 h-8 text-pink-primary animate-spin" />
      </div>
    );
  }

  return (
    <div className="max-w-2xl mx-auto space-y-8 animate-in fade-in duration-500">
      <div className="bg-white p-8 rounded-2xl shadow-sm border border-gray-100">
        <div className="flex items-center gap-3 mb-8">
          <div className="w-10 h-10 bg-pink-soft rounded-xl flex items-center justify-center text-pink-primary">
            <Shield className="w-6 h-6" />
          </div>
          <div>
            <h3 className="text-lg font-normal text-gray-900">System Configuration</h3>
            <p className="text-xs text-gray-500">Manage global application behavior and security policies.</p>
          </div>
        </div>

        <form onSubmit={handleSave} className="space-y-8">
          {/* Maintenance Mode */}
          <div className="flex items-center justify-between p-4 bg-gray-50 rounded-xl border border-gray-100">
            <div className="flex items-center gap-3">
              <div className={cn(
                "w-10 h-10 rounded-lg flex items-center justify-center transition-colors",
                settings.maintenanceMode ? "bg-red-100 text-red-600" : "bg-white text-gray-400"
              )}>
                <AlertTriangle className="w-5 h-5" />
              </div>
              <div>
                <p className="text-sm font-normal text-gray-900">Maintenance Mode</p>
                <p className="text-[10px] text-gray-500 uppercase tracking-widest">Disable user access for system updates</p>
              </div>
            </div>
            <button 
              type="button"
              onClick={() => setSettings(prev => ({ ...prev, maintenanceMode: !prev.maintenanceMode }))}
              className="text-gray-400 hover:text-pink-primary transition-colors"
            >
              {settings.maintenanceMode ? (
                <ToggleRight className="w-10 h-10 text-pink-primary" />
              ) : (
                <ToggleLeft className="w-10 h-10" />
              )}
            </button>
          </div>

          {/* Auto Assignment */}
          <div className="flex items-center justify-between p-4 bg-gray-50 rounded-xl border border-gray-100">
            <div className="flex items-center gap-3">
              <div className={cn(
                "w-10 h-10 rounded-lg flex items-center justify-center transition-colors",
                settings.autoAssignment ? "bg-green-100 text-green-600" : "bg-white text-gray-400"
              )}>
                <ToggleRight className="w-5 h-5" />
              </div>
              <div>
                <p className="text-sm font-normal text-gray-900">Auto-Assignment</p>
                <p className="text-[10px] text-gray-500 uppercase tracking-widest">Automatically assign tickets to available agents</p>
              </div>
            </div>
            <button 
              type="button"
              onClick={() => setSettings(prev => ({ ...prev, autoAssignment: !prev.autoAssignment }))}
              className="text-gray-400 hover:text-pink-primary transition-colors"
            >
              {settings.autoAssignment ? (
                <ToggleRight className="w-10 h-10 text-pink-primary" />
              ) : (
                <ToggleLeft className="w-10 h-10" />
              )}
            </button>
          </div>

          {/* Notification Email */}
          <div className="space-y-2">
            <label className="text-[10px] font-normal text-gray-400 uppercase tracking-widest flex items-center gap-2">
              <Mail className="w-3 h-3" />
              Notification Email
            </label>
            <input 
              type="email"
              value={settings.notificationEmail}
              onChange={(e) => setSettings(prev => ({ ...prev, notificationEmail: e.target.value }))}
              className="w-full px-4 py-3 bg-gray-50 border border-gray-200 rounded-xl text-sm focus:ring-2 focus:ring-pink-500 outline-none transition-all"
              placeholder="admin@example.com"
              required
            />
          </div>

          {/* Max Tickets */}
          <div className="space-y-2">
            <label className="text-[10px] font-normal text-gray-400 uppercase tracking-widest flex items-center gap-2">
              Max Tickets Per User
            </label>
            <input 
              type="number"
              value={settings.maxTicketsPerUser}
              onChange={(e) => setSettings(prev => ({ ...prev, maxTicketsPerUser: parseInt(e.target.value) }))}
              className="w-full px-4 py-3 bg-gray-50 border border-gray-200 rounded-xl text-sm focus:ring-2 focus:ring-pink-500 outline-none transition-all"
              min="1"
              max="100"
              required
            />
          </div>

          {message && (
            <div className={cn(
              "p-4 rounded-xl text-xs flex items-center gap-3 animate-in slide-in-from-top-2",
              message.type === 'success' ? "bg-green-50 text-green-600 border border-green-100" : "bg-red-50 text-red-600 border border-red-100"
            )}>
              <div className="w-5 h-5 rounded-full bg-white flex items-center justify-center shadow-sm">
                {message.type === 'success' ? '✓' : '!'}
              </div>
              {message.text}
            </div>
          )}

          <button 
            type="submit"
            disabled={saving}
            className="w-full py-4 bg-black text-white rounded-2xl font-normal text-sm hover:bg-opacity-90 transition-all shadow-lg shadow-black/10 flex items-center justify-center gap-2 disabled:opacity-50"
          >
            {saving ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <Save className="w-4 h-4" />
            )}
            Save Configuration
          </button>
        </form>
      </div>

      <div className="p-6 bg-gray-50 rounded-2xl border border-gray-100">
        <p className="text-[10px] text-gray-400 uppercase tracking-widest text-center">
          Last updated: {new Date(settings.updatedAt).toLocaleString()}
        </p>
      </div>
    </div>
  );
}
