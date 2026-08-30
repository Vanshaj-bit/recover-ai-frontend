

'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import API from '@/lib/api';
import { Users, CreditCard, LogOut, Plus, DollarSign, Settings as SettingsIcon, LayoutDashboard, ShieldAlert } from 'lucide-react';

// Load Razorpay Script Dynamically
const loadRazorpayScript = () => {
  return new Promise((resolve) => {
    const script = document.createElement("script");
    script.src = "https://checkout.razorpay.com/v1/checkout.js";
    script.onload = () => resolve(true);
    script.onerror = () => resolve(false);
    document.body.appendChild(script);
  });
};

export default function DashboardPage() {
  const router = useRouter();
  const [merchant, setMerchant] = useState<any>(null);
  const [customers, setCustomers] = useState<any[]>([]);
  const [payments, setPayments] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeView, setActiveView] = useState('dashboard');

  // Drawer state
  const [selectedPayment, setSelectedPayment] = useState<any>(null);
  const [isDrawerOpen, setIsDrawerOpen] = useState(false);

  // Form states
  const [newCustName, setNewCustName] = useState('');
  const [newCustEmail, setNewCustEmail] = useState('');
  const [newCustPhone, setNewCustPhone] = useState('');
  const [selectedCustomerId, setSelectedCustomerId] = useState('');
  const [orderAmount, setOrderAmount] = useState('');

  useEffect(() => {
    fetchData();
  }, []);

  const fetchData = async () => {
    try {
      const token = localStorage.getItem('token');
      if (!token) {
        router.push('/');
        return;
      }

      try {
        const profileRes = await API.get('/auth/me');
        setMerchant(profileRes.data);
      } catch (err: any) {
        console.error("Error fetching /auth/me:", err.response?.status, err.message);
      }

      try {
        const custRes = await API.get('/customers/');
        setCustomers(custRes.data);
        if (custRes.data.length > 0) setSelectedCustomerId(custRes.data[0].id);
      } catch (err: any) {
        console.error("Error fetching /customers/:", err.response?.status, err.message);
      }

      try {
        const payRes = await API.get('/payments/');
        setPayments(payRes.data);
      } catch (err: any) {
        console.error("Error fetching /payments/:", err.response?.status, err.message);
      }

    } catch (err) {
      console.error('General session error', err);
      localStorage.removeItem('token');
      router.push('/');
    } finally {
      setLoading(false);
    }
  };

  const handleCreateCustomer = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await API.post('/customers/', { name: newCustName, email: newCustEmail, phone: newCustPhone });
      setNewCustName(''); setNewCustEmail(''); setNewCustPhone('');
      fetchData();
    } catch (err: any) {
      alert(err.response?.data?.detail || 'Failed to create customer');
    }
  };

  const displayRazorpay = async (orderData: any, customerData: any) => {
    const res = await loadRazorpayScript();
    if (!res) {
      alert("Razorpay SDK failed to load. Are you online?");
      return;
    }

    const options = {
      key: "YOUR_RAZORPAY_TEST_KEY", // <-- REPLACE THIS WITH YOUR RZP TEST KEY
      amount: orderData.amount, 
      currency: "INR",
      name: "RecoverAI",
      description: "Test Transaction",
      order_id: orderData.razorpay_order_id,
      
      handler: function (response: any) {
        console.log("Payment Succeeded!", response);
        fetchData(); // Refresh dashboard on success
      },
      prefill: {
        name: customerData.name,
        email: customerData.email,
        contact: customerData.phone || "9999999999"
      },
      theme: {
        color: "#6C7BFF"
      }
    };

    // Use (window as any) to bypass TypeScript errors for Razorpay
    const paymentObject = new (window as any).Razorpay(options);

    // --- CATCHING THE FAILURE TO TRIGGER AI ---
    paymentObject.on('payment.failed', async function (response: any) {
      console.error("Payment Failed!", response.error);

      const mockWebhookPayload = {
        event: "payment.failed",
        payload: {
          payment: {
            entity: {
              order_id: response.error.metadata.order_id,
              id: response.error.metadata.payment_id,
              method: "card", 
              error_code: response.error.reason,
              error_description: response.error.description
            }
          }
        }
      };

      try {
        await fetch(`https://recover-ai-backend-izrn.onrender.com/api/v1/payments/webhook`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(mockWebhookPayload)
        });
        
        console.log("AI Agent Triggered Successfully!");
        fetchData(); // Instantly refresh the dashboard to show AI results!
        
      } catch (err) {
        console.error("Failed to trigger webhook", err);
      }
    });

    paymentObject.open();
  };

  const handleCreateOrder = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const amountInPaise = Math.round(parseFloat(orderAmount) * 100);
      
      // 1. Create the order in your backend
      const res = await API.post('/payments/orders', { 
        customer_id: selectedCustomerId, 
        amount: amountInPaise, 
        currency: 'INR' 
      });
      
      setOrderAmount('');
      
      // 2. Find the selected customer's details for Razorpay prefill
      const customerData = customers.find(c => c.id === selectedCustomerId) || { 
        name: 'Test Customer', 
        email: 'test@example.com' 
      };
      
      // 3. Open Razorpay!
      await displayRazorpay(res.data, customerData);

    } catch (err: any) {
      alert(err.response?.data?.detail || 'Failed to create order');
    }
  };

  const handleLogout = () => {
    localStorage.removeItem('token');
    router.push('/');
  };

  if (loading) {
    return <div className="flex min-h-screen items-center justify-center bg-[#0A0E17] text-white"><p className="animate-pulse">Loading RecoverAI...</p></div>;
  }

  const capturedCount = payments.filter(p => p.status === 'CAPTURED').length;
  const failedCount = payments.filter(p => p.status === 'FAILED').length;
  const pendingCount = payments.filter(p => p.status === 'PENDING').length;
  const totalRevenue = payments.filter(p => p.status === 'CAPTURED').reduce((acc, p) => acc + p.amount, 0);

  return (
    <div className="flex min-h-screen bg-[#0A0E17] text-[#EDF1F9] font-sans text-sm">
      {/* Sidebar */}
      <aside className="w-[232px] bg-[#121826] border-r border-[#1B2438] flex flex-col p-[22px_16px] sticky top-0 h-screen shrink-0">
        <div className="flex items-center gap-[10px] pb-[26px] px-2">
          <div className="w-[30px] h-[30px] rounded-[8px] bg-gradient-to-br from-[#6C7BFF] to-[#4655d8] flex items-center justify-center">
            <ShieldAlert className="w-4 h-4 text-white" />
          </div>
          <div>
            <div className="font-semibold text-[15.5px]">RecoverAI</div>
            <div className="text-[10px] text-[#566080] font-mono">SANDBOX MODE</div>
          </div>
        </div>

        <div className="text-[10.5px] uppercase tracking-[0.08em] text-[#566080] px-[10px] py-[16px] font-semibold">Workspace</div>
        <nav className="space-y-1">
          <button onClick={() => setActiveView('dashboard')} className={`w-full flex items-center gap-[10px] p-[9px_10px] rounded-[8px] text-[13.5px] font-medium transition ${activeView === 'dashboard' ? 'bg-[#6C7BFF]/14 text-white' : 'text-[#8A93AC] hover:bg-[#171F30]'}`}>
            <LayoutDashboard size={16} /> Dashboard
          </button>
          <button onClick={() => setActiveView('payments')} className={`w-full flex items-center gap-[10px] p-[9px_10px] rounded-[8px] text-[13.5px] font-medium transition ${activeView === 'payments' ? 'bg-[#6C7BFF]/14 text-white' : 'text-[#8A93AC] hover:bg-[#171F30]'}`}>
            <CreditCard size={16} /> Payments
          </button>
          <button onClick={() => setActiveView('customers')} className={`w-full flex items-center gap-[10px] p-[9px_10px] rounded-[8px] text-[13.5px] font-medium transition ${activeView === 'customers' ? 'bg-[#6C7BFF]/14 text-white' : 'text-[#8A93AC] hover:bg-[#171F30]'}`}>
            <Users size={16} /> Customers
          </button>
          <button onClick={() => setActiveView('settings')} className={`w-full flex items-center gap-[10px] p-[9px_10px] rounded-[8px] text-[13.5px] font-medium transition ${activeView === 'settings' ? 'bg-[#6C7BFF]/14 text-white' : 'text-[#8A93AC] hover:bg-[#171F30]'}`}>
            <SettingsIcon size={16} /> Settings
          </button>
        </nav>

        <div className="mt-auto pt-[14px] border-t border-[#1B2438] flex items-center justify-between">
          <div className="truncate">
            <div className="font-semibold text-xs truncate">{merchant?.business_name}</div>
            <div className="text-[11px] text-[#566080] truncate">{merchant?.email}</div>
          </div>
          <button onClick={handleLogout} className="p-2 text-red-400 hover:bg-red-500/10 rounded-lg transition" title="Logout">
            <LogOut size={16} />
          </button>
        </div>
      </aside>

      {/* Main Content */}
      <main className="flex-1 flex flex-col min-w-0">
        <header className="flex items-center justify-between px-8 py-[18px] border-b border-[#1B2438] sticky top-0 bg-[#0A0E17]/85 backdrop-blur-md z-10">
          <div>
            <h1 className="text-[19px] font-semibold capitalize">{activeView} Overview</h1>
            <p className="text-[12.5px] text-[#566080] mt-[2px]">Live payment activity across your account</p>
          </div>
          <div className="font-mono text-[10.5px] text-[#F0A857] bg-[#F0A857]/14 border border-[#F0A857]/30 px-2 py-1 rounded">
            ● RAZORPAY TEST MODE
          </div>
        </header>

        <div className="p-8 max-w-[1240px] w-full">
          {/* DASHBOARD VIEW */}
          {activeView === 'dashboard' && (
            <div className="space-y-6">
              {/* Stat Grid */}
              <div className="grid grid-cols-4 gap-4">
                <div className="bg-[#121826] border border-[#1B2438] rounded-xl p-4">
                  <div className="text-xs text-[#8A93AC] mb-2">Total Captured Revenue</div>
                  <div className="font-mono text-2xl font-semibold">₹ {totalRevenue / 100}</div>
                </div>
                <div className="bg-[#121826] border border-[#1B2438] rounded-xl p-4">
                  <div className="text-xs text-[#8A93AC] mb-2">Successful Payments</div>
                  <div className="font-mono text-2xl font-semibold text-emerald-400">{capturedCount}</div>
                </div>
                <div className="bg-[#121826] border border-[#1B2438] rounded-xl p-4">
                  <div className="text-xs text-[#8A93AC] mb-2">Failed Payments</div>
                  <div className="font-mono text-2xl font-semibold text-rose-400">{failedCount}</div>
                </div>
                <div className="bg-[#121826] border border-[#1B2438] rounded-xl p-4">
                  <div className="text-xs text-[#8A93AC] mb-2">Pending Orders</div>
                  <div className="font-mono text-2xl font-semibold text-amber-400">{pendingCount}</div>
                </div>
              </div>

              {/* Action Forms Grid */}
              <div className="grid grid-cols-2 gap-6">
                <div className="bg-[#121826] border border-[#1B2438] rounded-xl p-6">
                  <h3 className="font-semibold mb-4 flex items-center gap-2"><Users size={16} className="text-[#6C7BFF]" /> Add Customer</h3>
                  <form onSubmit={handleCreateCustomer} className="space-y-3">
                    <input type="text" placeholder="Full Name" value={newCustName} onChange={e => setNewCustName(e.target.value)} required className="w-full p-2 bg-[#171F30] border border-[#232C42] rounded text-xs" />
                    <input type="email" placeholder="Email Address" value={newCustEmail} onChange={e => setNewCustEmail(e.target.value)} required className="w-full p-2 bg-[#171F30] border border-[#232C42] rounded text-xs" />
                    <input type="text" placeholder="Phone Number" value={newCustPhone} onChange={e => setNewCustPhone(e.target.value)} className="w-full p-2 bg-[#171F30] border border-[#232C42] rounded text-xs" />
                    <button type="submit" className="w-full py-2 bg-[#6C7BFF] hover:bg-[#5b68e0] rounded text-xs font-semibold transition flex items-center justify-center gap-1"><Plus size={14} /> Add Customer</button>
                  </form>
                </div>

                <div className="bg-[#121826] border border-[#1B2438] rounded-xl p-6">
                  <h3 className="font-semibold mb-4 flex items-center gap-2"><CreditCard size={16} className="text-emerald-400" /> Create Payment Order</h3>
                  <form onSubmit={handleCreateOrder} className="space-y-3">
                    <select value={selectedCustomerId} onChange={e => setSelectedCustomerId(e.target.value)} className="w-full p-2 bg-[#171F30] border border-[#232C42] rounded text-xs" required>
                      {customers.map(c => <option key={c.id} value={c.id}>{c.name} ({c.email})</option>)}
                    </select>
                    <input type="number" placeholder="Amount in INR (e.g. 500)" value={orderAmount} onChange={e => setOrderAmount(e.target.value)} min="1" required className="w-full p-2 bg-[#171F30] border border-[#232C42] rounded text-xs" />
                    <button type="submit" className="w-full py-2 bg-emerald-600 hover:bg-emerald-500 rounded text-xs font-semibold transition flex items-center justify-center gap-1"><DollarSign size={14} /> Generate Order</button>
                  </form>
                </div>
              </div>

              {/* Recent Payments Table */}
              <div>
                <h3 className="font-semibold mb-3">Recent Transactions</h3>
                <div className="bg-[#121826] border border-[#1B2438] rounded-xl overflow-hidden">
                  <table className="w-full text-left border-collapse">
                    <thead>
                      <tr className="border-b border-[#1B2438] text-[11px] uppercase text-[#566080]">
                        <th className="p-4">Order ID</th>
                        <th className="p-4">Amount</th>
                        <th className="p-4">Status</th>
                        <th className="p-4">Time</th>
                      </tr>
                    </thead>
                    <tbody>
                      {payments.map(p => (
                        <tr key={p.id} onClick={() => { setSelectedPayment(p); setIsDrawerOpen(true); }} className="border-b border-[#1B2438] hover:bg-[#171F30] cursor-pointer transition">
                          <td className="p-4 font-mono text-xs text-[#6C7BFF]">{p.razorpay_order_id}</td>
                          <td className="p-4 font-mono font-semibold">₹ {p.amount / 100}</td>
                          <td className="p-4">
                            <span className={`px-2.5 py-1 rounded-full text-[10px] font-semibold ${p.status === 'CAPTURED' ? 'bg-emerald-500/10 text-emerald-400' : p.status === 'FAILED' ? 'bg-rose-500/10 text-rose-400' : 'bg-amber-500/10 text-amber-400'}`}>
                              {p.status}
                            </span>
                          </td>
                          <td className="p-4 text-xs text-[#566080]">{new Date(p.created_at).toLocaleTimeString()}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          )}

          {/* PAYMENTS VIEW */}
          {activeView === 'payments' && (
            <div className="bg-[#121826] border border-[#1B2438] rounded-xl overflow-hidden">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="border-b border-[#1B2438] text-[11px] uppercase text-[#566080]">
                    <th className="p-4">Order ID</th>
                    <th className="p-4">Payment ID</th>
                    <th className="p-4">Amount</th>
                    <th className="p-4">Method</th>
                    <th className="p-4">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {payments.map(p => (
                    <tr key={p.id} onClick={() => { setSelectedPayment(p); setIsDrawerOpen(true); }} className="border-b border-[#1B2438] hover:bg-[#171F30] cursor-pointer transition">
                      <td className="p-4 font-mono text-xs text-[#6C7BFF]">{p.razorpay_order_id}</td>
                      <td className="p-4 font-mono text-xs text-[#566080]">{p.razorpay_payment_id || '—'}</td>
                      <td className="p-4 font-mono font-semibold">₹ {p.amount / 100}</td>
                      <td className="p-4 text-xs">{p.payment_method || '—'}</td>
                      <td className="p-4">
                        <span className={`px-2.5 py-1 rounded-full text-[10px] font-semibold ${p.status === 'CAPTURED' ? 'bg-emerald-500/10 text-emerald-400' : p.status === 'FAILED' ? 'bg-rose-500/10 text-rose-400' : 'bg-amber-500/10 text-amber-400'}`}>
                          {p.status}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {/* CUSTOMERS VIEW */}
          {activeView === 'customers' && (
            <div className="bg-[#121826] border border-[#1B2438] rounded-xl overflow-hidden">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="border-b border-[#1B2438] text-[11px] uppercase text-[#566080]">
                    <th className="p-4">Name</th>
                    <th className="p-4">Email</th>
                    <th className="p-4">Phone</th>
                  </tr>
                </thead>
                <tbody>
                  {customers.map(c => (
                    <tr key={c.id} className="border-b border-[#1B2438] hover:bg-[#171F30]">
                      <td className="p-4 font-semibold">{c.name}</td>
                      <td className="p-4 text-[#8A93AC]">{c.email}</td>
                      <td className="p-4 text-[#566080]">{c.phone || '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {/* SETTINGS VIEW */}
          {activeView === 'settings' && (
            <div className="grid grid-cols-2 gap-4">
              <div className="bg-[#121826] border border-[#1B2438] p-6 rounded-xl">
                <h3 className="font-semibold mb-4">Sandbox Configuration</h3>
                <div className="flex justify-between py-2 border-b border-[#1B2438] text-xs"><span className="text-[#566080]">Webhook Endpoint</span><span className="font-mono">/api/v1/payments/webhook</span></div>
                <div className="flex justify-between py-2 text-xs"><span className="text-[#566080]">Environment</span><span className="font-mono text-amber-400">Test Mode</span></div>
              </div>
            </div>
          )}
        </div>
      </main>

      {/* Slide-over Payment Drawer */}
      {isDrawerOpen && selectedPayment && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex justify-end" onClick={() => setIsDrawerOpen(false)}>
          <div className="w-[400px] h-full bg-[#121826] border-l border-[#232C42] p-6 overflow-y-auto" onClick={e => e.stopPropagation()}>
            <div className="flex justify-between items-center mb-6">
              <h3 className="font-semibold text-base">Payment Details</h3>
              <button onClick={() => setIsDrawerOpen(false)} className="w-7 h-7 bg-[#171F30] rounded border border-[#232C42] flex items-center justify-center text-xs">✕</button>
            </div>
            <div className="space-y-4 text-xs">
              <div><span className="text-[#566080] block mb-1">Order ID</span><span className="font-mono text-[#6C7BFF]">{selectedPayment.razorpay_order_id}</span></div>
              <div><span className="text-[#566080] block mb-1">Razorpay Payment ID</span><span className="font-mono">{selectedPayment.razorpay_payment_id || 'Not captured'}</span></div>
              <div><span className="text-[#566080] block mb-1">Amount</span><span className="font-mono text-base font-semibold">₹ {selectedPayment.amount / 100}</span></div>
              <div><span className="text-[#566080] block mb-1">Status</span><span className="font-semibold">{selectedPayment.status}</span></div>
              <div><span className="text-[#566080] block mb-1">Payment Method</span><span>{selectedPayment.payment_method || '—'}</span></div>
              
              {selectedPayment.status === 'FAILED' && (
                <div className="p-3 bg-rose-500/10 border border-rose-500/20 rounded text-rose-300">
                  <span className="font-semibold block mb-1">Failure Reason:</span>
                  {selectedPayment.failure_reason || selectedPayment.failure_code || 'Unknown error'}
                </div>
              )}

              {/* --- AI RECOVERY INSIGHTS UI --- */}
              {selectedPayment?.metadata_obj?.recovery_probability && (
                <div className="mt-6 p-5 bg-slate-800 rounded-xl border border-slate-700 shadow-lg">
                  <div className="flex items-center gap-2 mb-4">
                    <span className="text-xl">✨</span>
                    <h3 className="text-lg font-semibold text-white">AI Recovery Strategy</h3>
                  </div>
                  
                  <div className="grid grid-cols-2 gap-4 mb-4">
                    <div className="bg-slate-900/50 p-4 rounded-lg border border-slate-700/50">
                      <p className="text-xs text-slate-400 uppercase tracking-wider font-semibold mb-1">Probability</p>
                      <p className="text-2xl font-bold text-emerald-400">
                        {selectedPayment.metadata_obj.recovery_probability}%
                      </p>
                    </div>
                    <div className="bg-slate-900/50 p-4 rounded-lg border border-slate-700/50">
                      <p className="text-xs text-slate-400 uppercase tracking-wider font-semibold mb-1">Channel</p>
                      <p className="text-2xl font-bold text-blue-400 capitalize">
                        {selectedPayment.metadata_obj.optimal_channel}
                      </p>
                    </div>
                  </div>

                  <div className="bg-slate-900/50 p-4 rounded-lg border border-slate-700/50">
                    <p className="text-xs text-slate-400 uppercase tracking-wider font-semibold mb-2">Suggested Message</p>
                    <p className="text-sm text-slate-300 italic leading-relaxed">
                      "{selectedPayment.metadata_obj.personalized_message}"
                    </p>
                  </div>
                </div>
              )}
              {/* --- END AI RECOVERY INSIGHTS UI --- */}

            </div>
          </div>
        </div>
      )}
    </div>
  );
}

