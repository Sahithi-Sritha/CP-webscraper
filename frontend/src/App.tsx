import { useState, useRef, useCallback } from "react";
import * as XLSX from "xlsx";
import axios from "axios";
import {
  UploadCloud,
  Play,
  Download,
  Search,
  AlertCircle,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  ArrowUpDown,
  RefreshCw,
  Users,
  FileSpreadsheet,
} from "lucide-react";
import { Button } from "./components/ui/button";
import { Input } from "./components/ui/input";
import { Card } from "./components/ui/card";
import { Progress } from "./components/ui/progress";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "./components/ui/table";

const API_BASE = import.meta.env.VITE_API_BASE || "http://localhost:8000";

// ── Types ────────────────────────────────────────────────────────────────────

interface StudentRow {
  "Student Name"?: string;
  "LeetCode Username"?: string;
  "CodeChef Username"?: string;
  lc_total_solved?: number;
  lc_easy?: number;
  lc_medium?: number;
  lc_hard?: number;
  lc_acceptance_rate?: number;
  lc_ranking?: number | string;
  lc_contest_rating?: number;
  lc_contest_ranking?: number | string;
  cc_rating?: number | string;
  cc_stars?: string;
  cc_global_rank?: number | string;
  cc_country_rank?: number | string;
  _status?: string;
  [key: string]: any;
}

interface ErrorEntry {
  student: string;
  platform: string;
  username: string;
  error: string;
}

interface FetchStatus {
  total: number;
  processed: number;
  successful: number;
  failed: number;
}

type SortKey = string;
type SortDir = "asc" | "desc";

// ── App ──────────────────────────────────────────────────────────────────────

export default function App() {
  const [parsedData, setParsedData] = useState<StudentRow[]>([]);
  const [results, setResults] = useState<StudentRow[]>([]);
  const [errors, setErrors] = useState<ErrorEntry[]>([]);
  const [searchTerm, setSearchTerm] = useState("");
  const [isFetching, setIsFetching] = useState(false);
  const [fetchDone, setFetchDone] = useState(false);
  const [jobId, setJobId] = useState<string | null>(null);
  const [status, setStatus] = useState<FetchStatus>({ total: 0, processed: 0, successful: 0, failed: 0 });
  const [errorsExpanded, setErrorsExpanded] = useState(false);
  const [sortKey, setSortKey] = useState<SortKey>("");
  const [sortDir, setSortDir] = useState<SortDir>("asc");
  const [fileName, setFileName] = useState<string>("");

  const fileInputRef = useRef<HTMLInputElement>(null);

  // ── File upload & parse ─────────────────────────────────────────────────

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setFileName(file.name);
    setFetchDone(false);
    setResults([]);
    setErrors([]);
    setJobId(null);

    const reader = new FileReader();
    reader.onload = (evt) => {
      try {
        const bstr = evt.target?.result;
        const wb = XLSX.read(bstr, { type: "binary" });
        const ws = wb.Sheets[wb.SheetNames[0]];
        const raw = XLSX.utils.sheet_to_json(ws) as StudentRow[];
        setParsedData(raw);
        setStatus({ total: raw.length, processed: 0, successful: 0, failed: 0 });
      } catch {
        alert("Failed to parse the Excel file. Please check the format.");
      }
    };
    reader.readAsBinaryString(file);
  };

  // ── Fetch data ──────────────────────────────────────────────────────────

  const handleFetchData = useCallback(async () => {
    if (parsedData.length === 0) return;
    setIsFetching(true);
    setFetchDone(false);
    setResults([]);
    setErrors([]);
    setStatus({ total: parsedData.length, processed: 0, successful: 0, failed: 0 });

    try {
      // Start the job
      const payload = {
        students: parsedData.map((s) => ({
          student_name: s["Student Name"] || "",
          leetcode_username: s["LeetCode Username"] || "",
          codechef_username: s["CodeChef Username"] || "",
        })),
      };

      const { data } = await axios.post(`${API_BASE}/api/process`, payload);
      const id = data.job_id;
      setJobId(id);

      // Poll for progress
      const poll = async () => {
        while (true) {
          await new Promise((r) => setTimeout(r, 1500));
          try {
            const res = await axios.get(`${API_BASE}/api/status/${id}`);
            const job = res.data;
            setStatus({
              total: job.total,
              processed: job.processed,
              successful: job.successful,
              failed: job.failed,
            });
            setResults(job.results);
            setErrors(job.errors);

            if (job.status === "completed") break;
          } catch {
            break;
          }
        }
      };
      await poll();
    } catch (err: any) {
      alert("Failed to connect to the backend. Make sure the server is running on port 8000.");
      console.error(err);
    } finally {
      setIsFetching(false);
      setFetchDone(true);
    }
  }, [parsedData]);

  // ── Download report ─────────────────────────────────────────────────────

  const handleDownload = async () => {
    if (!jobId) return;
    try {
      const res = await axios.get(`${API_BASE}/api/download/${jobId}`, { responseType: "blob" });
      const blob = new Blob([res.data], {
        type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      });
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `cp_report_${jobId}.xlsx`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      window.URL.revokeObjectURL(url);
    } catch {
      alert("Report is not ready yet or an error occurred.");
    }
  };

  // ── Sorting ─────────────────────────────────────────────────────────────

  const handleSort = (key: SortKey) => {
    if (sortKey === key) {
      setSortDir(sortDir === "asc" ? "desc" : "asc");
    } else {
      setSortKey(key);
      setSortDir("asc");
    }
  };

  // ── Table data ──────────────────────────────────────────────────────────

  const displayData = fetchDone ? results : parsedData;

  const filtered = displayData.filter((s) => {
    const t = searchTerm.toLowerCase();
    return (
      (s["Student Name"]?.toLowerCase() || "").includes(t) ||
      (s["LeetCode Username"]?.toLowerCase() || "").includes(t) ||
      (s["CodeChef Username"]?.toLowerCase() || "").includes(t)
    );
  });

  const sorted = [...filtered].sort((a, b) => {
    if (!sortKey) return 0;
    const aVal = a[sortKey] ?? "";
    const bVal = b[sortKey] ?? "";
    const numA = typeof aVal === "number" ? aVal : parseFloat(String(aVal));
    const numB = typeof bVal === "number" ? bVal : parseFloat(String(bVal));

    if (!isNaN(numA) && !isNaN(numB)) {
      return sortDir === "asc" ? numA - numB : numB - numA;
    }
    return sortDir === "asc"
      ? String(aVal).localeCompare(String(bVal))
      : String(bVal).localeCompare(String(aVal));
  });

  // ── Status badge ────────────────────────────────────────────────────────

  const statusBadge = (s?: string) => {
    if (s === "success") return <span className="inline-flex items-center rounded-full bg-emerald-50 border border-emerald-200 px-2.5 py-0.5 text-xs font-medium text-emerald-700">Success</span>;
    if (s === "partial") return <span className="inline-flex items-center rounded-full bg-amber-50 border border-amber-200 px-2.5 py-0.5 text-xs font-medium text-amber-700">Partial</span>;
    if (s === "failed")  return <span className="inline-flex items-center rounded-full bg-red-50 border border-red-200 px-2.5 py-0.5 text-xs font-medium text-red-700">Failed</span>;
    return <span className="inline-flex items-center rounded-full bg-slate-100 border border-slate-200 px-2.5 py-0.5 text-xs font-medium text-slate-500">Pending</span>;
  };

  // ── Sortable header helper ──────────────────────────────────────────────

  const SortHeader = ({ label, colKey, align }: { label: string; colKey: string; align?: string }) => (
    <TableHead
      className={`text-slate-500 font-medium text-xs uppercase tracking-wider cursor-pointer select-none hover:text-slate-800 transition-colors ${align === "right" ? "text-right" : align === "center" ? "text-center" : ""}`}
      onClick={() => handleSort(colKey)}
    >
      <span className="inline-flex items-center gap-1">
        {label}
        <ArrowUpDown className="h-3 w-3 opacity-40" />
      </span>
    </TableHead>
  );

  // ── Render ──────────────────────────────────────────────────────────────

  return (
    <div className="min-h-screen bg-slate-50">
      {/* Top bar */}
      <header className="border-b border-slate-200 bg-white px-8 py-4">
        <div className="mx-auto flex max-w-7xl items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="flex h-8 w-8 items-center justify-center rounded-md bg-slate-900">
              <FileSpreadsheet className="h-4 w-4 text-white" />
            </div>
            <div>
              <h1 className="text-lg font-semibold tracking-tight text-slate-900">CP Dashboard</h1>
              <p className="text-xs text-slate-400">LeetCode · CodeChef Student Tracker</p>
            </div>
          </div>

          {fileName && (
            <span className="hidden sm:inline-flex items-center gap-1.5 rounded-md border border-slate-200 bg-slate-50 px-3 py-1.5 text-xs text-slate-500">
              <FileSpreadsheet className="h-3 w-3" />
              {fileName}
            </span>
          )}
        </div>
      </header>

      <main className="mx-auto max-w-7xl space-y-5 px-8 py-6">
        {/* Action toolbar */}
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 rounded-lg border border-slate-200 bg-white p-4">
          <div className="flex items-center gap-2.5 w-full sm:w-auto">
            <input type="file" accept=".xlsx,.xls" className="hidden" ref={fileInputRef} onChange={handleFileUpload} />
            <Button
              variant="outline"
              onClick={() => fileInputRef.current?.click()}
              disabled={isFetching}
              className="border-slate-200 text-slate-600 hover:bg-slate-50 hover:text-slate-900"
            >
              <UploadCloud className="mr-2 h-4 w-4" />
              Upload Excel
            </Button>
            <Button
              onClick={handleFetchData}
              disabled={parsedData.length === 0 || isFetching}
              className="bg-slate-900 text-white hover:bg-slate-800"
            >
              {isFetching ? <RefreshCw className="mr-2 h-4 w-4 animate-spin" /> : <Play className="mr-2 h-4 w-4" />}
              {isFetching ? "Fetching…" : "Fetch Data"}
            </Button>
          </div>

          <div className="flex items-center gap-2.5 w-full sm:w-auto">
            <div className="relative w-full sm:w-60">
              <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-slate-400" />
              <Input
                type="text"
                placeholder="Search students…"
                className="pl-9 border-slate-200 bg-slate-50 text-sm focus-visible:ring-0 focus-visible:border-slate-300"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
              />
            </div>
            <Button
              variant="outline"
              disabled={!fetchDone || !jobId}
              onClick={handleDownload}
              className="border-slate-200 text-slate-600 hover:text-slate-900"
            >
              <Download className="mr-2 h-4 w-4" />
              Export
            </Button>
          </div>
        </div>

        {/* Stats bar */}
        {parsedData.length > 0 && (
          <div className="rounded-lg border border-slate-200 bg-white overflow-hidden">
            <div className="flex flex-wrap items-center gap-x-8 gap-y-2 px-5 py-3">
              <div className="flex items-center gap-2">
                <Users className="h-4 w-4 text-slate-400" />
                <span className="text-sm text-slate-500">Total</span>
                <span className="text-sm font-semibold text-slate-900">{status.total}</span>
              </div>
              {(isFetching || fetchDone) && (
                <>
                  <div className="flex items-center gap-2">
                    <CheckCircle2 className="h-4 w-4 text-emerald-500" />
                    <span className="text-sm text-slate-500">Success</span>
                    <span className="text-sm font-semibold text-emerald-700">{status.successful}</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <AlertCircle className="h-4 w-4 text-red-400" />
                    <span className="text-sm text-slate-500">Failed</span>
                    <span className="text-sm font-semibold text-red-600">{status.failed}</span>
                  </div>
                  <div className="ml-auto text-sm font-medium text-slate-500">
                    {status.processed}/{status.total} processed
                  </div>
                </>
              )}
            </div>
            {isFetching && (
              <div className="px-5 pb-3">
                <Progress value={status.total > 0 ? (status.processed / status.total) * 100 : 0} className="h-1.5 bg-slate-100" />
              </div>
            )}
          </div>
        )}

        {/* Data table */}
        <Card className="border-slate-200 overflow-hidden">
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow className="border-slate-200 bg-slate-50/80 hover:bg-slate-50/80">
                  <SortHeader label="Student" colKey="Student Name" />
                  <SortHeader label="LC User" colKey="LeetCode Username" />
                  <SortHeader label="CC User" colKey="CodeChef Username" />
                  {fetchDone && (
                    <>
                      <SortHeader label="LC Solved" colKey="lc_total_solved" align="right" />
                      <SortHeader label="Easy" colKey="lc_easy" align="right" />
                      <SortHeader label="Med" colKey="lc_medium" align="right" />
                      <SortHeader label="Hard" colKey="lc_hard" align="right" />
                      <SortHeader label="Accept %" colKey="lc_acceptance_rate" align="right" />
                      <SortHeader label="LC Rank" colKey="lc_ranking" align="right" />
                      <SortHeader label="CC Rating" colKey="cc_rating" align="right" />
                      <SortHeader label="CC Stars" colKey="cc_stars" align="center" />
                    </>
                  )}
                  <TableHead className="text-slate-500 font-medium text-xs uppercase tracking-wider text-center">Status</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {sorted.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={fetchDone ? 12 : 4} className="h-32 text-center text-slate-400 text-sm">
                      {searchTerm
                        ? "No students match your search."
                        : "Upload an Excel sheet to get started."}
                    </TableCell>
                  </TableRow>
                ) : (
                  sorted.map((s, i) => (
                    <TableRow key={i} className="border-slate-100 transition-colors hover:bg-slate-50/60">
                      <TableCell className="font-medium text-slate-900 text-sm">{s["Student Name"] || "–"}</TableCell>
                      <TableCell className="text-slate-600 text-sm font-mono">{s["LeetCode Username"] || "–"}</TableCell>
                      <TableCell className="text-slate-600 text-sm font-mono">{s["CodeChef Username"] || "–"}</TableCell>
                      {fetchDone && (
                        <>
                          <TableCell className="text-right text-sm font-semibold text-slate-800">{s.lc_total_solved ?? "–"}</TableCell>
                          <TableCell className="text-right text-sm text-emerald-600">{s.lc_easy ?? "–"}</TableCell>
                          <TableCell className="text-right text-sm text-amber-600">{s.lc_medium ?? "–"}</TableCell>
                          <TableCell className="text-right text-sm text-red-500">{s.lc_hard ?? "–"}</TableCell>
                          <TableCell className="text-right text-sm text-slate-600">{s.lc_acceptance_rate != null ? `${s.lc_acceptance_rate}%` : "–"}</TableCell>
                          <TableCell className="text-right text-sm text-slate-600">{s.lc_ranking ?? "–"}</TableCell>
                          <TableCell className="text-right text-sm text-slate-600">{s.cc_rating ?? "–"}</TableCell>
                          <TableCell className="text-center text-sm text-slate-600">{s.cc_stars ?? "–"}</TableCell>
                        </>
                      )}
                      <TableCell className="text-center">{statusBadge(s._status)}</TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </div>
        </Card>

        {/* Error logs */}
        {errors.length > 0 && (
          <div className="rounded-lg border border-red-100 bg-white overflow-hidden">
            <button
              className="flex w-full items-center justify-between px-5 py-3 text-left hover:bg-slate-50/50 transition-colors"
              onClick={() => setErrorsExpanded(!errorsExpanded)}
            >
              <span className="flex items-center gap-2 text-sm font-medium text-red-600">
                <AlertCircle className="h-4 w-4" />
                {errors.length} error{errors.length !== 1 ? "s" : ""} encountered
              </span>
              {errorsExpanded ? <ChevronUp className="h-4 w-4 text-slate-400" /> : <ChevronDown className="h-4 w-4 text-slate-400" />}
            </button>
            {errorsExpanded && (
              <div className="border-t border-red-50 px-5 py-3 space-y-2 max-h-64 overflow-y-auto">
                {errors.map((err, i) => (
                  <div key={i} className="flex items-start gap-3 text-sm py-1.5 border-b border-slate-50 last:border-0">
                    <span className="inline-flex shrink-0 items-center rounded bg-slate-100 px-1.5 py-0.5 text-xs font-mono text-slate-600">{err.platform}</span>
                    <div className="text-slate-600">
                      <span className="font-medium text-slate-800">{err.student}</span>
                      <span className="mx-1 text-slate-300">·</span>
                      <span className="font-mono text-xs">{err.username}</span>
                      <span className="mx-1 text-slate-300">→</span>
                      <span className="text-red-500">{err.error}</span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </main>
    </div>
  );
}
