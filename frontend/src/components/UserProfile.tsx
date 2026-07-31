import { useState, useRef, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { User as UserIcon, LogOut, Settings, ShieldAlert } from 'lucide-react';

export default function UserProfile() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const [isOpen, setIsOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  if (!user) return null;

  const handleLogout = async () => {
    await logout();
    navigate('/login');
  };

  const getRoleBadgeColor = () => {
    switch (user.role) {
      case 'admin':
        return 'var(--danger)';
      case 'analyst':
        return 'var(--warning)';
      case 'viewer':
      default:
        return 'var(--text-muted)';
    }
  };

  // Get initials for avatar
  const initials = user.full_name
    ? user.full_name.split(' ').map((n) => n[0]).join('').substring(0, 2).toUpperCase()
    : user.username.substring(0, 2).toUpperCase();

  return (
    <div className="user-profile-dropdown" ref={dropdownRef}>
      <button 
        className="user-avatar-btn" 
        onClick={() => setIsOpen(!isOpen)}
        title={user.username}
      >
        <div className="user-avatar">
          {initials}
        </div>
      </button>

      {isOpen && (
        <div className="dropdown-menu">
          <div className="dropdown-header">
            <div className="dropdown-user-info">
              <span className="dropdown-user-name">{user.full_name || user.username}</span>
              <span className="dropdown-user-email">{user.email}</span>
            </div>
            <div 
              className="dropdown-user-role" 
              style={{ color: getRoleBadgeColor(), borderColor: getRoleBadgeColor() }}
            >
              {user.role === 'admin' && <ShieldAlert size={12} style={{ marginRight: '4px' }} />}
              {user.role.toUpperCase()}
            </div>
          </div>
          
          <div className="dropdown-divider"></div>
          
          <button className="dropdown-item">
            <UserIcon size={16} />
            Profile Settings
          </button>
          
          <button className="dropdown-item">
            <Settings size={16} />
            Preferences
          </button>
          
          <div className="dropdown-divider"></div>
          
          <button className="dropdown-item danger" onClick={handleLogout}>
            <LogOut size={16} />
            Sign out
          </button>
        </div>
      )}
    </div>
  );
}
