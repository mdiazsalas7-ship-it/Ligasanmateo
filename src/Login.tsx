import React, { useState } from 'react';
import { auth } from './firebase';
import { signInWithEmailAndPassword } from 'firebase/auth';

// ─────────────────────────────────────────────────────────────
// LOGIN — solo administradores
//
// La app es de lectura pública: el hincha NO necesita cuenta para
// ver calendario, tablas, estadísticas ni noticias. Las únicas
// cuentas que existen son las del admin y la mesa técnica, y se
// crean a mano desde la consola de Firebase.
//
// Por eso se eliminó el auto-registro: antes cualquier persona
// podía crearse un usuario desde aquí.
// ─────────────────────────────────────────────────────────────

const Login: React.FC<{ onClose?: () => void }> = ({ onClose }) => {
    const [email, setEmail]       = useState('');
    const [password, setPassword] = useState('');
    const [error, setError]       = useState('');
    const [loading, setLoading]   = useState(false);

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setError('');
        setLoading(true);

        try {
            await signInWithEmailAndPassword(auth, email.trim(), password);
        } catch (err: any) {
            console.error('[Login]', err?.code, err?.message);
            switch (err?.code) {
                case 'auth/invalid-credential':
                case 'auth/wrong-password':
                case 'auth/user-not-found':
                    setError('Correo o contraseña incorrectos.');
                    break;
                case 'auth/too-many-requests':
                    setError('Demasiados intentos. Espera unos minutos.');
                    break;
                case 'auth/network-request-failed':
                    setError('Sin conexión. Revisa tu internet.');
                    break;
                default:
                    setError(`No se pudo entrar (${err?.code || 'error desconocido'}).`);
            }
        } finally {
            setLoading(false);
        }
    };

    return (
        <div style={{
            display: 'flex', justifyContent: 'center', alignItems: 'center',
            height: '100vh', width: '100vw', padding: '20px',
            // El archivo /fondo-login.jpg no existe en /public — se usaba
            // y quedaba el fondo en blanco. Degradado de la marca.
            background: 'linear-gradient(135deg, #1e3a8a 0%, #1e40af 55%, #0f172a 100%)',
            position: 'fixed', top: 0, left: 0, boxSizing: 'border-box',
        }}>
            <div className="animate-fade-in" style={{
                background: 'white', padding: '40px', borderRadius: '16px',
                boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.5)', width: '100%', maxWidth: '400px',
                position: 'relative',
            }}>
                {onClose && (
                    <button
                        onClick={onClose}
                        style={{
                            position: 'absolute', top: 12, right: 16, background: 'none',
                            border: 'none', fontSize: '1.3rem', color: '#94a3b8', cursor: 'pointer',
                        }}
                    >✕</button>
                )}

                <div style={{ textAlign: 'center', marginBottom: '30px' }}>
                    <img
                        src="/logo-login.png"
                        alt="Logo"
                        style={{ width: '80px', borderRadius: '10px', marginBottom: '15px' }}
                    />
                    <h2 style={{ color: '#1f2937', margin: '0 0 5px 0' }}>Liga San Mateo</h2>
                    <p style={{ color: '#6b7280', fontSize: '0.9rem' }}>
                        Acceso de administración
                    </p>
                </div>

                {error && (
                    <div style={{
                        background: '#fee2e2', color: '#991b1b', padding: '10px',
                        borderRadius: '6px', marginBottom: '20px', fontSize: '0.9rem', textAlign: 'center',
                    }}>
                        {error}
                    </div>
                )}

                <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '15px' }}>
                    <div>
                        <label style={labelStyle}>Correo Electrónico</label>
                        <input
                            type="email"
                            required
                            autoComplete="username"
                            value={email}
                            onChange={(e) => setEmail(e.target.value)}
                            style={inputStyle}
                            placeholder="ejemplo@correo.com"
                        />
                    </div>

                    <div>
                        <label style={labelStyle}>Contraseña</label>
                        <input
                            type="password"
                            required
                            autoComplete="current-password"
                            value={password}
                            onChange={(e) => setPassword(e.target.value)}
                            style={inputStyle}
                            placeholder="******"
                        />
                    </div>

                    <button
                        type="submit"
                        disabled={loading}
                        className="btn"
                        style={{
                            background: '#2563eb', color: 'white', padding: '12px', borderRadius: '8px',
                            fontSize: '1rem', fontWeight: 'bold', border: 'none',
                            cursor: loading ? 'not-allowed' : 'pointer', marginTop: '10px',
                            opacity: loading ? 0.7 : 1,
                        }}
                    >
                        {loading ? 'Entrando...' : 'Entrar'}
                    </button>
                </form>
            </div>
        </div>
    );
};

const labelStyle: React.CSSProperties = {
    display: 'block', fontSize: '0.8rem', fontWeight: 'bold',
    color: '#374151', marginBottom: '5px', textTransform: 'uppercase',
};

const inputStyle: React.CSSProperties = {
    width: '100%', padding: '12px', borderRadius: '8px',
    border: '1px solid #d1d5db', fontSize: '1rem', boxSizing: 'border-box',
};

export default Login;
