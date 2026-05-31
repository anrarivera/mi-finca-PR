import { useState, useRef, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { Settings, LogOut, LayoutDashboard } from 'lucide-react'
import { useLogout } from '@/features/auth/hooks/useAuth';

export default function SideMenu() {
    const [error, setError] = useState('');
    const [open, setOpen] = useState(false);
    const navigate = useNavigate();
    const logout = useLogout();

    function handleDashboard() {
        navigate('/dashboard')
    }
        
    async function handleLogout(e: React.FormEvent) {
        setOpen(false)
    
        console.log('Logging out...')
        e.preventDefault()
        setError('')

        try {
            await logout.mutateAsync()
        } catch (err) {
            setError(err instanceof Error ? err.message : 'Error al cerrar sesión')
        }
    }

    function handleSettings() {
        // setOpen(false)
        navigate('/settings')
    }

    return (
        <nav className="w-16 h-full bg-[#d9ded7] flex flex-col items-center py-6">

            {/* Dashboard */}
            <div className="flex flex-col items-center gap-4">
                <button
                    onClick={handleDashboard}
                    className="w-10 h-10 flex items-center justify-center rounded-lg text-[#3d5a2a] hover:bg-[#f0f5e8] transition-colors"
                >
                    <LayoutDashboard size={20} />
                </button>
            </div>

                {/* Settings + Logout */}
            <div className="mt-auto flex flex-col items-center gap-4">
                <button
                    onClick={handleSettings}
                    className="w-10 h-10 flex items-center justify-center rounded-lg text-[#3d5a2a] hover:bg-[#f0f5e8] transition-colors"
                    title='Settings'
                >
                    <Settings size={20} />
                </button>

                <div className="h-px w-8 bg-gray-300" />

                <button
                    onClick={handleLogout}
                    className="w-10 h-10 flex items-center justify-center rounded-lg text-red-600 hover:bg-red-50 transition-colors"
                    title='Logout'
                >
                    <LogOut size={20} />
                </button>
            </div>

        </nav>
        )
}