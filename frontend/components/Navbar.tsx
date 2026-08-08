"use client";

import Link from "next/link";
import { Button } from "./ui/button";
import { useEffect, useState } from "react";
import { LogOut, User as UserIcon } from "lucide-react";

interface User {
  id: number;
  email: string;
  full_name?: string;
  avatar_url?: string;
}

export function Navbar() {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const checkAuth = async () => {
      try {
        const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";
        const res = await fetch(`${API_URL}/auth/me`, {
          credentials: "include",
        });
        const data = await res.json();
        if (data.authenticated) {
          setUser(data.user);
        }
      } catch (err) {
        console.error("Auth check failed", err);
      } finally {
        setLoading(false);
      }
    };
    checkAuth();
  }, []);

  const handleLogout = async () => {
    try {
      const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";
      await fetch(`${API_URL}/auth/logout`, {
        method: "POST",
        credentials: "include",
      });
      setUser(null);
      window.location.href = "/";
    } catch (err) {
      console.error("Logout failed", err);
    }
  };

  return (
    <nav className="border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
      <div className="container mx-auto flex h-14 items-center justify-between px-4">
        <Link href="/" className="mr-6 flex items-center space-x-2">
          <span className="text-xl font-bold bg-gradient-to-r from-pink-500 to-purple-500 bg-clip-text text-transparent">
            ClipAI
          </span>
        </Link>
        
        <div className="flex items-center space-x-4">
          <Link href="/dashboard">
            <Button variant="ghost">Dashboard</Button>
          </Link>
          <Link href="/upload">
            <Button variant="ghost">Upload</Button>
          </Link>
          <Link href="/settings">
            <Button variant="ghost">Settings</Button>
          </Link>

          {user ? (
            <div className="flex items-center gap-2 pl-4 border-l border-zinc-800">
              {user.avatar_url ? (
                <img src={user.avatar_url} alt="Avatar" className="w-8 h-8 rounded-full" />
              ) : (
                <div className="w-8 h-8 rounded-full bg-zinc-800 flex items-center justify-center">
                   <UserIcon className="w-4 h-4 text-zinc-400" />
                </div>
              )}
              <span className="text-sm font-medium hidden md:block">{user.full_name || user.email}</span>
              <Button variant="ghost" className="gap-2" onClick={handleLogout} title="Sign Out">
                <LogOut className="w-4 h-4" />
                <span className="hidden sm:inline">Logout</span>
              </Button>
            </div>
          ) : (
            !loading && (
              <Link href="/login">
                <Button>Sign In</Button>
              </Link>
            )
          )}
        </div>
      </div>
    </nav>
  );
}
