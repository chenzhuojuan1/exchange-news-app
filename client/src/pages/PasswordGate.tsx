import { trpc } from "@/lib/trpc";
import { useState, useEffect } from "react";

const STORAGE_KEY = "site_access_granted";

interface PasswordGateProps {
  children: React.ReactNode;
}

export default function PasswordGate({ children }: PasswordGateProps) {
  const [granted, setGranted] = useState<boolean>(() => {
    return localStorage.getItem(STORAGE_KEY) === "true";
  });
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const { data: passwordCheck, isLoading: checkLoading } = trpc.auth.passwordRequired.useQuery();
  const verifyMutation = trpc.auth.verifyPassword.useMutation();

  // If password protection is not enabled, grant access immediately
  useEffect(() => {
    if (passwordCheck && !passwordCheck.required) {
      setGranted(true);
    }
  }, [passwordCheck]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!password.trim()) return;
    setLoading(true);
    setError("");
    try {
      const result = await verifyMutation.mutateAsync({ password });
      if (result.success) {
        localStorage.setItem(STORAGE_KEY, "true");
        setGranted(true);
      } else {
        setError((result as any).error || "密码错误，请重试");
      }
    } catch (err) {
      setError("验证失败，请重试");
    } finally {
      setLoading(false);
    }
  };

  if (checkLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="text-gray-400 text-sm">加载中...</div>
      </div>
    );
  }

  if (granted) {
    return <>{children}</>;
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50">
      <div className="bg-white rounded-2xl shadow-lg p-8 w-full max-w-sm mx-4">
        <div className="text-center mb-6">
          <div className="text-3xl mb-3">🔒</div>
          <h1 className="text-xl font-semibold text-gray-800">境外交易所新闻</h1>
          <p className="text-sm text-gray-500 mt-1">请输入访问密码</p>
        </div>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="请输入密码"
              className="w-full px-4 py-2.5 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              autoFocus
              disabled={loading}
            />
            {error && (
              <p className="text-red-500 text-xs mt-1.5">{error}</p>
            )}
          </div>
          <button
            type="submit"
            disabled={loading || !password.trim()}
            className="w-full bg-blue-600 hover:bg-blue-700 disabled:bg-gray-300 text-white font-medium py-2.5 rounded-lg text-sm transition-colors"
          >
            {loading ? "验证中..." : "进入"}
          </button>
        </form>
      </div>
    </div>
  );
}
