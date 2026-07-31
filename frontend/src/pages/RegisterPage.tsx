/* SCA Platform — Register Page */

import { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { Shield, Eye, EyeOff, AlertCircle, Loader2, CheckCircle2 } from 'lucide-react';

export default function RegisterPage() {
  const [email, setEmail] = useState('');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [fullName, setFullName] = useState('');
  
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  
  const { register } = useAuth();
  const navigate = useNavigate();

  // Basic password validation for UI feedback
  const hasMinLength = password.length >= 8;
  const hasUpper = /[A-Z]/.test(password);
  const hasLower = /[a-z]/.test(password);
  const hasNumber = /[0-9]/.test(password);
  const isPasswordValid = hasMinLength && hasUpper && hasLower && hasNumber;
  const passwordsMatch = password && confirmPassword && password === confirmPassword;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    if (!isPasswordValid) {
      setError('Password does not meet the requirements.');
      return;
    }
    
    if (!passwordsMatch) {
      setError('Passwords do not match.');
      return;
    }

    setIsLoading(true);

    try {
      await register({
        email,
        username,
        password,
        full_name: fullName || undefined,
      });
      setSuccess(true);
      setTimeout(() => navigate('/login'), 2500);
    } catch (err: any) {
      const msg =
        err?.response?.data?.detail ||
        err?.response?.data?.error?.message ||
        'Registration failed. Please try again.';
      setError(msg);
      setSuccess(false);
    } finally {
      setIsLoading(false);
    }
  };

  if (success) {
    return (
      <div className="auth-page">
        <div className="auth-container success">
          <div className="auth-success-icon">
            <CheckCircle2 size={48} />
          </div>
          <h2 className="auth-title">Registration Successful!</h2>
          <p className="auth-subtitle">
            Your account has been created. Redirecting to login...
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="auth-page">
      <div className="auth-container">
        {/* Logo / Branding */}
        <div className="auth-header">
          <div className="auth-logo">
            <Shield size={36} />
          </div>
          <h1 className="auth-title">Create Account</h1>
          <p className="auth-subtitle">Join the SCA Platform</p>
        </div>

        {/* Registration Form */}
        <form onSubmit={handleSubmit} className="auth-form">
          {error && (
            <div className="auth-error">
              <AlertCircle size={16} />
              <span>{error}</span>
            </div>
          )}

          <div className="auth-field-group">
            <div className="auth-field">
              <label htmlFor="username">Username *</label>
              <input
                id="username"
                type="text"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                placeholder="johndoe"
                required
                minLength={3}
                maxLength={150}
                pattern="^[a-zA-Z0-9_]+$"
                title="Only letters, numbers, and underscores allowed"
                disabled={isLoading}
              />
            </div>

            <div className="auth-field">
              <label htmlFor="email">Email *</label>
              <input
                id="email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="john@example.com"
                required
                disabled={isLoading}
              />
            </div>
          </div>

          <div className="auth-field">
            <label htmlFor="fullName">Full Name</label>
            <input
              id="fullName"
              type="text"
              value={fullName}
              onChange={(e) => setFullName(e.target.value)}
              placeholder="John Doe"
              maxLength={255}
              disabled={isLoading}
            />
          </div>

          <div className="auth-field">
            <label htmlFor="password">Password *</label>
            <div className="auth-password-wrapper">
              <input
                id="password"
                type={showPassword ? 'text' : 'password'}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="Create a strong password"
                required
                disabled={isLoading}
              />
              <button
                type="button"
                className="auth-password-toggle"
                onClick={() => setShowPassword(!showPassword)}
                tabIndex={-1}
              >
                {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
              </button>
            </div>
            
            {/* Password strength indicators */}
            {password.length > 0 && (
              <div className="password-requirements">
                <div className={`req-item ${hasMinLength ? 'met' : ''}`}>
                  {hasMinLength ? <CheckCircle2 size={12} /> : <div className="dot" />} 8+ chars
                </div>
                <div className={`req-item ${hasUpper ? 'met' : ''}`}>
                  {hasUpper ? <CheckCircle2 size={12} /> : <div className="dot" />} Uppercase
                </div>
                <div className={`req-item ${hasLower ? 'met' : ''}`}>
                  {hasLower ? <CheckCircle2 size={12} /> : <div className="dot" />} Lowercase
                </div>
                <div className={`req-item ${hasNumber ? 'met' : ''}`}>
                  {hasNumber ? <CheckCircle2 size={12} /> : <div className="dot" />} Number
                </div>
              </div>
            )}
          </div>

          <div className="auth-field">
            <label htmlFor="confirmPassword">Confirm Password *</label>
            <div className="auth-password-wrapper">
              <input
                id="confirmPassword"
                type={showConfirmPassword ? 'text' : 'password'}
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                placeholder="Confirm your password"
                required
                disabled={isLoading}
              />
              <button
                type="button"
                className="auth-password-toggle"
                onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                tabIndex={-1}
              >
                {showConfirmPassword ? <EyeOff size={18} /> : <Eye size={18} />}
              </button>
            </div>
            {confirmPassword.length > 0 && !passwordsMatch && (
              <span className="field-error-text">Passwords do not match</span>
            )}
          </div>

          <button 
            type="submit" 
            className="auth-submit" 
            disabled={isLoading || (password.length > 0 && (!isPasswordValid || !passwordsMatch))}
          >
            {isLoading ? (
              <>
                <Loader2 size={18} className="spin" />
                Creating Account...
              </>
            ) : (
              'Create Account'
            )}
          </button>
        </form>

        {/* Footer */}
        <div className="auth-footer">
          <span>Already have an account?</span>
          <Link to="/login" className="auth-link">
            Sign in
          </Link>
        </div>
      </div>
    </div>
  );
}
