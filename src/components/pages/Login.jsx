import React, { useState } from 'react';
import { useStore } from '../../store/useStore.js';
import { signIn } from '../../lib/supabaseHelpers.js';
import { Lock, AlertCircle, CheckCircle } from 'lucide-react';

export default function Login() {
  const { setCurrentUser, showToast } = useStore();
  const [userType, setUserType] = useState('admin');
  const [email, setEmail] = useState('admin@postplat.com');
  const [password, setPassword] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState(null);

  const handleLogin = async (e) => {
    e.preventDefault();
    setError(null);
    setIsLoading(true);

    try {
      if (userType === 'store') {
        setError('El acceso como Tienda no está disponible aún');
        setIsLoading(false);
        return;
      }

      const { data, error: signInError } = await signIn(email, password);

      if (signInError || !data?.user) {
        setError('Credenciales inválidas. Intenta con admin@postplat.com');
        setIsLoading(false);
        return;
      }

      // Successful login
      setCurrentUser(
        {
          id: data.user.id,
          email: data.user.email,
          name: 'Administrador',
        },
        'admin'
      );

      showToast('success', `¡Bienvenido Administrador!`);
    } catch (err) {
      setError('Error al conectar. Intenta nuevamente.');
      console.error('Login error:', err);
    } finally {
      setIsLoading(false);
    }
  };

  const handleDemoLogin = () => {
    // For development: login without password
    setCurrentUser(
      {
        id: 'demo-admin',
        email: 'admin@postplat.com',
        name: 'Administrador',
      },
      'admin'
    );
    showToast('success', '¡Modo Demo - Acceso como Administrador!');
  };

  return (
    <div className="min-h-screen bg-zinc-950 flex items-center justify-center p-4">
      <div className="w-full max-w-md">
        {/* Header */}
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-16 h-16 bg-emerald-500/20 rounded-lg mb-4">
            <Lock className="w-8 h-8 text-emerald-500" />
          </div>
          <h1 className="text-3xl font-bold text-white mb-2">POST-PLAT</h1>
          <p className="text-zinc-400">Sistema de Gestión de Empresas y POS</p>
        </div>

        {/* User Type Selection */}
        <div className="grid grid-cols-2 gap-3 mb-8">
          <button
            onClick={() => setUserType('admin')}
            className={`p-4 rounded-lg border-2 transition-all ${
              userType === 'admin'
                ? 'border-emerald-500 bg-emerald-500/10'
                : 'border-zinc-700 bg-zinc-900/50 hover:border-zinc-600'
            }`}
          >
            <div className="text-sm font-semibold text-white">Admin</div>
            <div className="text-xs text-zinc-400 mt-1">Sistema Principal</div>
          </button>

          <button
            disabled
            onClick={() => setUserType('store')}
            className="p-4 rounded-lg border-2 border-zinc-700 bg-zinc-900/20 opacity-50 cursor-not-allowed"
          >
            <div className="text-sm font-semibold text-zinc-500">Tienda</div>
            <div className="text-xs text-zinc-600 mt-1">Próximamente</div>
          </button>
        </div>

        {/* Login Form */}
        <form onSubmit={handleLogin} className="space-y-4 mb-6">
          {/* Email Input */}
          <div>
            <label className="block text-sm font-medium text-white mb-2">
              Correo Electrónico
            </label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="admin@postplat.com"
              className="w-full px-4 py-2 bg-zinc-900 border border-zinc-700 rounded-lg text-white placeholder-zinc-500 focus:outline-none focus:border-emerald-500 transition-colors"
              disabled={isLoading}
            />
          </div>

          {/* Password Input */}
          <div>
            <label className="block text-sm font-medium text-white mb-2">
              Contraseña
            </label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="••••••••"
              className="w-full px-4 py-2 bg-zinc-900 border border-zinc-700 rounded-lg text-white placeholder-zinc-500 focus:outline-none focus:border-emerald-500 transition-colors"
              disabled={isLoading}
            />
            <p className="text-xs text-zinc-500 mt-1">
              Para pruebas, puedes usar cualquier contraseña
            </p>
          </div>

          {/* Error Message */}
          {error && (
            <div className="flex items-center gap-2 p-3 bg-red-500/10 border border-red-500/20 rounded-lg">
              <AlertCircle className="w-4 h-4 text-red-500" />
              <span className="text-sm text-red-400">{error}</span>
            </div>
          )}

          {/* Login Button */}
          <button
            type="submit"
            disabled={isLoading || userType !== 'admin'}
            className="w-full py-2 bg-emerald-600 hover:bg-emerald-700 disabled:bg-zinc-700 disabled:cursor-not-allowed text-white font-semibold rounded-lg transition-colors flex items-center justify-center gap-2"
          >
            {isLoading ? (
              <>
                <div className="w-4 h-4 border-2 border-emerald-300 border-t-transparent rounded-full animate-spin" />
                <span>Conectando...</span>
              </>
            ) : (
              <span>Entrar como {userType === 'admin' ? 'Administrador' : 'Tienda'}</span>
            )}
          </button>
        </form>

        {/* Demo Login Button */}
        <button
          onClick={handleDemoLogin}
          className="w-full py-2 border border-zinc-700 text-zinc-300 font-medium rounded-lg hover:border-zinc-600 hover:bg-zinc-900/50 transition-colors flex items-center justify-center gap-2"
        >
          <CheckCircle className="w-4 h-4" />
          <span>Acceso de Demostración</span>
        </button>

        {/* Footer */}
        <div className="mt-8 text-center text-xs text-zinc-500">
          <p>Sistema POST-PLAT v1.0</p>
          <p>Conectado a Supabase</p>
        </div>
      </div>
    </div>
  );
}
