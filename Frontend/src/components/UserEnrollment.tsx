import React, { useState } from 'react';
import { db, auth, setDoc, doc, getDoc } from '../lib/firebase';
import { UserProfile } from '../types';
import { Loader2, User, Phone, Building2, Save, AlertCircle } from 'lucide-react';

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

interface UserEnrollmentProps {
  onComplete: (profile: UserProfile) => void;
}

export default function UserEnrollment({ onComplete }: UserEnrollmentProps) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [formData, setFormData] = useState({
    name: auth.currentUser?.displayName || '',
    email: auth.currentUser?.email || '',
    phone: '',
    department: '',
  });

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!auth.currentUser) return;

    setLoading(true);
    setError(null);

    try {
      const userRef = doc(db, 'users', auth.currentUser.uid);
      const docSnap = await getDoc(userRef);

      if (docSnap.exists()) {
        const existingProfile = docSnap.data() as UserProfile;
        onComplete(existingProfile);
        return;
      }

      const profile: UserProfile = {
        uid: auth.currentUser.uid,
        name: formData.name,
        email: formData.email,
        phone: formData.phone,
        department: formData.department,
        role: formData.email === 'ramanadhamjayaveer@mictech.edu.in' ? 'admin' : 'user',
        createdAt: Date.now(),
      };

      await setDoc(userRef, profile);
      onComplete(profile);
    } catch (err) {
      console.error('Enrollment error:', err);
      setError('Failed to save profile. Please try again.');
      // We don't call handleFirestoreError here to avoid breaking the UI flow with a thrown error
      // but we log it for debugging.
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="max-w-md mx-auto p-8 bg-white rounded-2xl shadow-xl border border-gray-100">
      <div className="text-center mb-8">
        <div className="w-12 h-12 bg-pink-soft rounded-xl flex items-center justify-center text-pink-primary mx-auto mb-4">
          <User className="w-6 h-6" />
        </div>
        <h2 className="text-xl font-normal text-gray-900">Complete Your Profile</h2>
        <p className="text-gray-500 mt-2 text-xs">Please provide your details to continue.</p>
      </div>

      {error && (
        <div className="mb-6 p-3 bg-red-50 border border-red-100 rounded-lg text-red-600 text-[10px] flex items-center gap-2">
          <AlertCircle className="w-3.5 h-3.5" />
          {error}
        </div>
      )}

      <form onSubmit={handleSubmit} className="space-y-6">
        <div className="space-y-1.5">
          <label className="text-xs font-normal text-gray-700 flex items-center gap-2">
            <User className="w-3.5 h-3.5" /> Full Name
          </label>
          <input
            required
            value={formData.name}
            onChange={(e) => setFormData({ ...formData, name: e.target.value })}
            className="w-full px-4 py-2.5 bg-gray-50 border border-gray-200 rounded-lg focus:ring-2 focus:ring-pink-500 outline-none transition-all text-sm"
            placeholder="John Doe"
          />
        </div>

        <div className="space-y-1.5">
          <label className="text-xs font-normal text-gray-700 flex items-center gap-2">
            <Phone className="w-3.5 h-3.5" /> Phone Number
          </label>
          <input
            required
            type="tel"
            value={formData.phone}
            onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
            className="w-full px-4 py-2.5 bg-gray-50 border border-gray-200 rounded-lg focus:ring-2 focus:ring-pink-500 outline-none transition-all text-sm"
            placeholder="+1 (555) 000-0000"
          />
        </div>

        <div className="space-y-1.5">
          <label className="text-xs font-normal text-gray-700 flex items-center gap-2">
            <Building2 className="w-3.5 h-3.5" /> Department
          </label>
          <select
            required
            value={formData.department}
            onChange={(e) => setFormData({ ...formData, department: e.target.value })}
            className="w-full px-4 py-2.5 bg-gray-50 border border-gray-200 rounded-lg focus:ring-2 focus:ring-pink-500 outline-none transition-all text-sm"
          >
            <option value="">Select Department</option>
            <option value="IT">IT Support</option>
            <option value="HR">Human Resources</option>
            <option value="Finance">Finance</option>
            <option value="Operations">Operations</option>
            <option value="Sales">Sales</option>
          </select>
        </div>

        <button
          type="submit"
          disabled={loading}
          className="w-full py-3.5 bg-pink-primary text-white rounded-xl font-normal text-sm hover:bg-pink-600 transition-all shadow-lg shadow-pink-100 flex items-center justify-center gap-2"
        >
          {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
          Save Profile & Continue
        </button>
      </form>
    </div>
  );
}
