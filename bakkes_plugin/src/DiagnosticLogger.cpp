#include "DiagnosticLogger.h"

#include <chrono>
#include <ctime>
#include <filesystem>
#include <fstream>
#include <iomanip>
#include <mutex>
#include <sstream>
#include <cstdlib>

static std::mutex g_logMutex;
static std::string g_logPath;

void DiagnosticLogger::Init()
{
    try {
        const char* appdata = std::getenv("APPDATA");
        std::filesystem::path base;
        if (appdata && appdata[0] != '\0') {
            base = appdata;
        } else {
            base = std::filesystem::temp_directory_path();
        }

        std::filesystem::path dir = base / "bakkesmod" / "rltrainingjournal_logs";
        std::error_code ec;
        std::filesystem::create_directories(dir, ec);

        auto now = std::chrono::system_clock::now();
        std::time_t t = std::chrono::system_clock::to_time_t(now);
        std::tm tm;
#ifdef _WIN32
        localtime_s(&tm, &t);
#else
        localtime_r(&t, &tm);
#endif

        std::ostringstream oss;
        oss << std::put_time(&tm, "%Y%m%d-%H%M%S");
        std::string filename = std::string("rltrainingjournal_") + oss.str() + ".log";

        g_logPath = (dir / filename).string();

        // Write header
        std::ofstream ofs(g_logPath, std::ios::out | std::ios::app);
        if (ofs) {
            ofs << "--- RLTrainingJournal Diagnostic Log " << oss.str() << " ---\n";
            ofs.close();
        }
    } catch (...) {
        // Best-effort; do not throw
    }
}

void DiagnosticLogger::Log(const std::string& msg)
{
    std::lock_guard<std::mutex> lock(g_logMutex);
    try {
        if (g_logPath.empty()) {
            Init();
        }
        auto now = std::chrono::system_clock::now();
        std::time_t t = std::chrono::system_clock::to_time_t(now);
        std::tm tm;
#ifdef _WIN32
        localtime_s(&tm, &t);
#else
        localtime_r(&t, &tm);
#endif

        std::ostringstream oss;
        oss << std::put_time(&tm, "%Y-%m-%d %H:%M:%S") << " - " << msg << "\n";

        std::ofstream ofs(g_logPath, std::ios::out | std::ios::app);
        if (ofs) {
            ofs << oss.str();
        }
    } catch (...) {
        // swallow errors; logging must not crash plugin
    }
}
