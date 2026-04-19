import React, { useState, useEffect } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { signInWithPhoneNumber, RecaptchaVerifier } from 'firebase/auth';
import { auth } from '../firebase'; 

export default function SmsAuthComponent() {
  const [loading, setLoading] = useState(false);
  const [countryCode, setCountryCode] = useState('+972');
  const [phoneNumber, setPhoneNumber] = useState('');
  const [verificationCode, setVerificationCode] = useState('');
  const [step, setStep] = useState(1);
  const [confirmationResult, setConfirmationResult] = useState(null);
  const [err, setErr] = useState('');
  const [msg, setMsg] = useState('');
  
  const navigate = useNavigate();

  // מנגנון האבטחה - עכשיו עם פונקציית ניקיון מיוחדת שמונעת קריסות!
  useEffect(() => {
    // 1. קודם כל, מנקים שאריות של מנגנונים ישנים כדי למנוע את שגיאת ה-removed
    if (window.recaptchaVerifier) {
      window.recaptchaVerifier.clear();
      window.recaptchaVerifier = null;
    }

    // 2. יוצרים מנגנון חדש ונקי
    window.recaptchaVerifier = new RecaptchaVerifier(auth, 'recaptcha-container', {
      size: 'invisible',
      callback: () => {},
      'expired-callback': () => {}
    });

    // 3. כשהקומפוננטה נסגרת או מתרעננת (Hot Reload), ננקה את המנגנון שוב
    return () => {
      if (window.recaptchaVerifier) {
        window.recaptchaVerifier.clear();
        window.recaptchaVerifier = null;
      }
    };
  }, []);

  const sendVerificationCode = async (e) => {
    e.preventDefault();
    setLoading(true);
    setErr('');
    setMsg('');
    
    const appVerifier = window.recaptchaVerifier;

    // מנקים את המספר מרווחים, מקפים וכל טקסט אחר
    const cleanPhone = phoneNumber.replace(/[^0-9]/g, '');
    // מחברים לקידומת ומורידים את ה-0 בהתחלה אם יש
    const formattedPhoneNumber = countryCode + cleanPhone.replace(/^0/, '');

    try {
      const result = await signInWithPhoneNumber(auth, formattedPhoneNumber, appVerifier);
      setConfirmationResult(result);
      setStep(2);
      setMsg('שלחנו לך קוד אימות ב-SMS.');
    } catch (error) {
      console.error(error);
      setErr('מספר טלפון לא תקין או שחלה שגיאה בשליחה.');
    } finally {
      setLoading(false);
    }
  };

  const verifyCode = async (e) => {
    e.preventDefault();
    setLoading(true);
    setErr('');
    setMsg('');

    try {
      await confirmationResult.confirm(verificationCode);
      setMsg('התחברת בהצלחה! מעביר אותך...');
      
      setTimeout(() => {
        navigate('/'); 
      }, 1500);

    } catch (error) {
      console.error(error);
      setErr('קוד אימות שגוי, אנא נסה שוב.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <main className="auth-wrap">
      <div className="auth-card">
        <div className="auth-header">
          <p className="auth-subtitle">כניסה מהירה ובטוחה</p>
          <h1 className="auth-title">התחברות עם SMS</h1>
        </div>

        <div id="recaptcha-container"></div>

        {step === 1 && (
          <form onSubmit={sendVerificationCode} className="auth-form">
            <label className="auth-label" style={{ display: 'block', marginBottom: '8px' }}>
              מספר טלפון
            </label>
            
            <div style={{ display: 'flex', gap: '10px', direction: 'ltr', marginBottom: '15px' }}>
              <select 
                className="auth-input" 
                value={countryCode} 
                onChange={(e) => setCountryCode(e.target.value)}
                style={{ width: '120px', padding: '10px', cursor: 'pointer' }}
              >
                <option value="+972">IL (+972)</option>
                <option value="+1">US (+1)</option>
                <option value="+44">UK (+44)</option>
              </select>
              
              <input
                className="auth-input"
                type="tel"
                placeholder="0501234567"
                value={phoneNumber}
                onChange={(e) => setPhoneNumber(e.target.value)}
                required
                autoFocus
                style={{ flex: 1, padding: '10px' }} 
              />
            </div>
            
            {err && <div className="auth-error">{err}</div>}
            {msg && <div className="auth-success">{msg}</div>}
            
            <button className="auth-primary" type="submit" disabled={loading}>
              {loading ? "שולח..." : "שלח קוד אימות"}
            </button>
            
            <p className="auth-switch" style={{ marginTop: 12 }}>
              <Link to="/login" className="auth-link">חזרה להתחברות</Link>
            </p>
          </form>
        )}

        {step === 2 && (
          <form onSubmit={verifyCode} className="auth-form">
            <label className="auth-label">
              קוד אימות (6 ספרות)
              <input
                className="auth-input"
                type="text"
                inputMode="numeric"
                maxLength={6}
                placeholder="הכנס את הקוד"
                value={verificationCode}
                onChange={(e) => setVerificationCode(e.target.value)}
                required
                autoFocus
              />
            </label>
            
            {err && <div className="auth-error">{err}</div>}
            {msg && <div className="auth-success">{msg}</div>}
            
            <button className="auth-primary" type="submit" disabled={loading}>
              {loading ? "מאמת..." : "אמת והיכנס"}
            </button>
            
            <p className="auth-switch" style={{ marginTop: 12 }}>
              <button
                type="button"
                className="auth-link"
                onClick={() => { setStep(1); setErr(""); setMsg(""); }}
              >
                שנה מספר טלפון
              </button>
              {" · "}
              <Link to="/login" className="auth-link">חזרה להתחברות</Link>
            </p>
          </form>
        )}
      </div>
    </main>
  );
}