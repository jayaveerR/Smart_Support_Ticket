import React, { useMemo } from 'react';
import { 
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, 
  PieChart, Pie, Cell, LineChart, Line, Legend 
} from 'recharts';
import { Ticket } from '../types';
import { subDays, eachDayOfInterval } from 'date-fns';
import { formatDate } from '../lib/utils';

const COLORS = ['#FF6321', '#000000', '#8E9299', '#4a4a4a', '#d1d1d1'];

export default function AdminAnalytics({ tickets }: { tickets: Ticket[] }) {
  const categoryData = useMemo(() => {
    const counts: Record<string, number> = {};
    tickets.forEach(t => {
      counts[t.category] = (counts[t.category] || 0) + 1;
    });
    return Object.entries(counts).map(([name, value]) => ({ name, value }));
  }, [tickets]);

  const statusData = useMemo(() => {
    const counts: Record<string, number> = {};
    tickets.forEach(t => {
      counts[t.status] = (counts[t.status] || 0) + 1;
    });
    return Object.entries(counts).map(([name, value]) => ({ name, value }));
  }, [tickets]);

  const dailyTrendData = useMemo(() => {
    const last7Days = eachDayOfInterval({
      start: subDays(new Date(), 6),
      end: new Date(),
    });

    return last7Days.map(day => {
      const dayStr = formatDate(day, 'MMM d');
      const count = tickets.filter(t => {
        if (!t.createdAt) return false;
        return formatDate(t.createdAt, 'yyyy-MM-dd') === formatDate(day, 'yyyy-MM-dd');
      }).length;
      return { name: dayStr, tickets: count };
    });
  }, [tickets]);

  return (
    <div className="space-y-8 animate-in fade-in duration-500">
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
        {/* Ticket Volume Trend */}
        <div className="bg-white p-6 rounded-2xl shadow-sm border border-gray-100">
          <h3 className="text-sm font-normal text-gray-900 mb-6 uppercase tracking-widest">Ticket Volume (Last 7 Days)</h3>
          <div className="h-[300px] w-full">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={dailyTrendData}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f0f0f0" />
                <XAxis 
                  dataKey="name" 
                  axisLine={false} 
                  tickLine={false} 
                  tick={{ fontSize: 10, fill: '#9ca3af' }}
                />
                <YAxis 
                  axisLine={false} 
                  tickLine={false} 
                  tick={{ fontSize: 10, fill: '#9ca3af' }}
                />
                <Tooltip 
                  contentStyle={{ borderRadius: '12px', border: 'none', boxShadow: '0 10px 15px -3px rgb(0 0 0 / 0.1)' }}
                />
                <Line 
                  type="monotone" 
                  dataKey="tickets" 
                  stroke="#FF6321" 
                  strokeWidth={3} 
                  dot={{ r: 4, fill: '#FF6321', strokeWidth: 2, stroke: '#fff' }}
                  activeDot={{ r: 6, strokeWidth: 0 }}
                />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Category Distribution */}
        <div className="bg-white p-6 rounded-2xl shadow-sm border border-gray-100">
          <h3 className="text-sm font-normal text-gray-900 mb-6 uppercase tracking-widest">Category Distribution</h3>
          <div className="h-[300px] w-full">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={categoryData} layout="vertical">
                <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke="#f0f0f0" />
                <XAxis type="number" hide />
                <YAxis 
                  dataKey="name" 
                  type="category" 
                  axisLine={false} 
                  tickLine={false} 
                  tick={{ fontSize: 10, fill: '#9ca3af' }}
                  width={100}
                />
                <Tooltip 
                  cursor={{ fill: '#f9fafb' }}
                  contentStyle={{ borderRadius: '12px', border: 'none', boxShadow: '0 10px 15px -3px rgb(0 0 0 / 0.1)' }}
                />
                <Bar dataKey="value" fill="#000000" radius={[0, 4, 4, 0]} barSize={20} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Status Breakdown */}
        <div className="bg-white p-6 rounded-2xl shadow-sm border border-gray-100">
          <h3 className="text-sm font-normal text-gray-900 mb-6 uppercase tracking-widest">Status Breakdown</h3>
          <div className="h-[300px] w-full">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie
                  data={statusData}
                  cx="50%"
                  cy="50%"
                  innerRadius={60}
                  outerRadius={100}
                  paddingAngle={5}
                  dataKey="value"
                >
                  {statusData.map((entry, index) => (
                    <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                  ))}
                </Pie>
                <Tooltip 
                  contentStyle={{ borderRadius: '12px', border: 'none', boxShadow: '0 10px 15px -3px rgb(0 0 0 / 0.1)' }}
                />
                <Legend verticalAlign="bottom" height={36} iconType="circle" wrapperStyle={{ fontSize: '10px', textTransform: 'uppercase', letterSpacing: '0.05em' }} />
              </PieChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Key Metrics Summary */}
        <div className="bg-white p-6 rounded-2xl shadow-sm border border-gray-100 flex flex-col justify-center">
          <h3 className="text-sm font-normal text-gray-900 mb-8 uppercase tracking-widest">Performance Metrics</h3>
          <div className="grid grid-cols-2 gap-8">
            <div className="space-y-1">
              <p className="text-[10px] text-gray-400 uppercase tracking-widest">Avg. Resolution Time</p>
              <p className="text-3xl font-light text-gray-900">4.2h</p>
            </div>
            <div className="space-y-1">
              <p className="text-[10px] text-gray-400 uppercase tracking-widest">First Response Time</p>
              <p className="text-3xl font-light text-gray-900">18m</p>
            </div>
            <div className="space-y-1">
              <p className="text-[10px] text-gray-400 uppercase tracking-widest">Customer Satisfaction</p>
              <p className="text-3xl font-light text-gray-900">98%</p>
            </div>
            <div className="space-y-1">
              <p className="text-[10px] text-gray-400 uppercase tracking-widest">SLA Compliance</p>
              <p className="text-3xl font-light text-gray-900">94%</p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
