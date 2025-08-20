import React, { useState } from "react";
import { createUserWithEmailAndPassword, updateProfile } from "firebase/auth";
import { auth, storage } from "../firebase";
import { ref, uploadBytes } from "firebase/storage";
import { Link, useNavigate } from "react-router-dom";
import { FaEye, FaEyeSlash } from "react-icons/fa";

export default function SignupPage() {
    const [name, setName] = useState("");
    const [email, setEmail] = useState("");
    const [pw, setPw] = useState("");
    const [confirmPw, setConfirmPw] = useState("");
    const [showPw, setShowPw] = useState(false);
    const [showConfirm, setShowConfirm] = useState(false);
    const [error, setError] = useState("");
    const navigate = useNavigate();

    const doSignup = async (e) => {
        e.preventDefault();
        setError("");
        if (pw !== confirmPw) {
            setError("Passwords do not match");
            return;
        }
        try {
            const { user } = await createUserWithEmailAndPassword(auth, email, pw);
            
            if (name) {
                await updateProfile(user, { displayName: name });
            }

            // Create a folder in Firebase Storage with the user's email
            const sanitizedEmail = email.replace(/[.#$[\]]/g, '_');
            const placeholderFileRef = ref(storage, `${sanitizedEmail}/.placeholder`);
            const emptyBlob = new Blob([], { type: 'text/plain' });
            await uploadBytes(placeholderFileRef, emptyBlob);

            navigate("/");
        } catch (err) {
            setError(err.message);
        }
    };

    return (
        <main className="auth-wrap">
            <div className="auth-card">
                <div className="auth-header">
                    <p className="auth-subtitle">Please enter your details</p>
                    <h1 className="auth-title">Create your account</h1>
                </div>

                <form onSubmit={doSignup} className="auth-form">
                    <label className="auth-label">
                        Name
                        <input
                            className="auth-input"
                            type="text"
                            value={name}
                            onChange={(e) => setName(e.target.value)}
                        />
                    </label>

                    <label className="auth-label">
                        Email address
                        <input
                            className="auth-input"
                            type="email"
                            value={email}
                            onChange={(e) => setEmail(e.target.value)}
                            required
                        />
                    </label>

                    <label className="auth-label">
                        Password
                        <div className="pw-wrap">
                            <input
                                className="auth-input"
                                type={showPw ? "text" : "password"}
                                value={pw}
                                onChange={(e) => setPw(e.target.value)}
                                required
                            />
                            <button type="button" className="eye-btn" onClick={() => setShowPw((s) => !s)}>
                                {showPw ? <FaEyeSlash /> : <FaEye />}
                            </button>
                        </div>
                    </label>

                    <label className="auth-label">
                        Confirm Password
                        <div className="pw-wrap">
                            <input
                                className="auth-input"
                                type={showConfirm ? "text" : "password"}
                                value={confirmPw}
                                onChange={(e) => setConfirmPw(e.target.value)}
                                required
                            />
                            <button type="button" className="eye-btn" onClick={() => setShowConfirm((s) => !s)}>
                                {showConfirm ? <FaEyeSlash /> : <FaEye />}
                            </button>
                        </div>
                    </label>

                    {error && <div className="auth-error">{error}</div>}

                    <button className="auth-primary" type="submit">Sign up</button>
                </form>

                <p className="auth-switch">
                    Already have an account? <Link to="/login" className="auth-link">Log in</Link>
                </p>
            </div>
        </main>
    );
}
