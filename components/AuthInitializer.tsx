"use client";

import { useEffect } from "react";
import { useUserPreferences } from "@/hooks/useUserPreferences";
import AuthModal from "./AuthModal";

export default function AuthInitializer() {
  const { checkAuth } = useUserPreferences();

  useEffect(() => {
    checkAuth();
  }, [checkAuth]);

  return <AuthModal />;
}
