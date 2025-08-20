import React, { useEffect, useRef, useState } from "react";
import { NavLink, Link } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import logo from './logo.png'; // Correct import for the logo
import menu from './menu.png'; // Correct import for the menu icon

export default function Header() {
    const { user, logout } = useAuth();
    const [isMenuOpen, setIsMenuOpen] = useState(false);
    
    const menuRef = useRef(null);
    const btnRef = useRef(null);

    useEffect(() => {
        const handleOutsideClick = (e) => {
            if (
                menuRef.current &&
                !menuRef.current.contains(e.target) &&
                btnRef.current &&
                !btnRef.current.contains(e.target)
            ) {
                setIsMenuOpen(false);
            }
        };
        document.addEventListener("mousedown", handleOutsideClick);
        return () => document.removeEventListener("mousedown", handleOutsideClick);
    }, []);

    const isAdmin = !!user && user.email === "lensdance29@gmail.com";

    const handleMenuItemClick = () => {
        setIsMenuOpen(false);
    };

    return (
        <header className="navbar">
            <div className="left-side">
                <Link to="/" className="site-logo">
                    <img className="logo-img" src={logo} alt="Lens Dance logo" />
                </Link>
                <div className="site-name">
                    <Link to="/" className="site-title">Lens Dance</Link>
                </div>
            </div>

            <div className="center-menu">
                <nav className="nav-links">
                    <NavLink to="/" end>Home</NavLink>
                    <NavLink to="/gallery">Gallery</NavLink>
                    <NavLink to="/me">My Pics</NavLink>
                    <NavLink to="/contact">Contact</NavLink>
                    {isAdmin && <NavLink to="/admin">Admin</NavLink>}
                </nav>
            </div>

            <div className="right-side">
                {!user ? (
                    <div className="auth-controls">
                        <Link to="/login" className="auth-btn">Log in</Link>
                        <Link to="/signup" className="auth-btn">Sign up</Link>
                    </div>
                ) : (
                    <button className="auth-btn" onClick={logout}>Logout</button>
                )}
                
                <button
                    ref={btnRef}
                    className="hamburger-btn"
                    onClick={() => setIsMenuOpen(!isMenuOpen)}
                    aria-label="Toggle navigation menu"
                >
                    <img src={menu} alt="Menu" />
                </button>
            </div>

            {isMenuOpen && (
                <div ref={menuRef} className="dropdown-menu">
                    <NavLink to="/" onClick={handleMenuItemClick}>Home</NavLink>
                    <NavLink to="/gallery" onClick={handleMenuItemClick}>Gallery</NavLink>
                    <NavLink to="/me" onClick={handleMenuItemClick}>My Pics</NavLink>
                    <NavLink to="/contact" onClick={handleMenuItemClick}>Contact</NavLink>
                    {isAdmin && <NavLink to="/admin" onClick={handleMenuItemClick}>Admin</NavLink>}
                    <hr />
                    {!user ? (
                        <>
                            <Link to="/login" onClick={handleMenuItemClick}>Log in</Link>
                            <Link to="/signup" onClick={handleMenuItemClick}>Sign up</Link>
                        </>
                    ) : (
                        <button onClick={logout}>Logout</button>
                    )}
                </div>
            )}
        </header>
    );
}
