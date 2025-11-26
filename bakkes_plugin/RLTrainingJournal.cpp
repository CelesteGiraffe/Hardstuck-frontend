#include "pch.h"
#include "RLTrainingJournal.h"
#include "ApiClient.h"
#include "DiagnosticLogger.h"

#include "bakkesmod/wrappers/GameWrapper.h"
#include "bakkesmod/wrappers/arraywrapper.h"
#include "bakkesmod/wrappers/GameEvent/ServerWrapper.h"
#include "bakkesmod/wrappers/GameEvent/GameSettingPlaylistWrapper.h"
#include "bakkesmod/wrappers/GameObject/CarWrapper.h"
#include "bakkesmod/wrappers/GameObject/PriWrapper.h"
#include "bakkesmod/wrappers/GameObject/TeamWrapper.h"
#include "bakkesmod/wrappers/MMRWrapper.h"
#include "bakkesmod/wrappers/UniqueIDWrapper.h"
#include "bakkesmod/wrappers/Engine/UnrealStringWrapper.h"

#if __has_include("imgui.h")
#include "imgui.h"
#elif __has_include("imgui/imgui.h")
#include "imgui/imgui.h"
#else
#include "imgui_stub.h"
#endif

#include <algorithm>
#include <cmath>
#include <ctime>
#include <cctype>
#include <cstring>
#include <future>
#include <iomanip>
#include <sstream>
#include <thread>
#include <unordered_map>
#include <functional>
#include <fstream>
#include <filesystem>
#include <cstdlib>

// Helper to copy into fixed-size C buffers without triggering MSVC deprecation warnings
static inline void SafeStrCopy(char* dest, const char* src, size_t destSize)
{
#ifdef _MSC_VER
    strncpy_s(dest, destSize, src, _TRUNCATE);
#else
    std::strncpy(dest, src, destSize - 1);
    dest[destSize - 1] = '\0';
#endif
}
static inline void SafeStrCopy(char* dest, const std::string& src, size_t destSize)
{
    SafeStrCopy(dest, src.c_str(), destSize);
}

// Re-enable SDK plugin registration macro when building with the BakkesMod SDK
BAKKESMOD_PLUGIN(RLTrainingJournalPlugin, "Hardstuck", "1.0", PERMISSION_ALL)

namespace
{
    constexpr char kBaseUrlCvarName[] = "rtj_api_base_url";
    constexpr char kForceLocalhostCvarName[] = "rtj_force_localhost";
    constexpr char kUserIdCvarName[] = "rtj_user_id";
    constexpr char kGamesPlayedCvarName[] = "rtj_games_played_increment";
    constexpr char kUiEnabledCvarName[] = "rtj_ui_enabled";
    constexpr char kDefaultBaseUrl[] = "http://localhost:4000";
    constexpr const char* kLocalhostBaseUrl = kDefaultBaseUrl;
    constexpr char kLanBaseUrl[] = "http://192.168.1.236:4000";

    std::string Trimmed(const std::string& value)
    {
        std::string trimmed = value;
        trimmed.erase(trimmed.begin(), std::find_if(trimmed.begin(), trimmed.end(), [](unsigned char ch) {
                          return !std::isspace(ch);
                      }));
        trimmed.erase(std::find_if(trimmed.rbegin(), trimmed.rend(), [](unsigned char ch) {
                          return !std::isspace(ch);
                      }).base(),
                      trimmed.end());
        return trimmed;
    }

    std::string EnsureHttpScheme(const std::string& url)
    {
        std::string trimmed = Trimmed(url);
        if (trimmed.empty())
        {
            return trimmed;
        }

        std::string lowered = trimmed;
        std::transform(lowered.begin(), lowered.end(), lowered.begin(), [](unsigned char ch) {
            return static_cast<char>(std::tolower(ch));
        });

        if (lowered.rfind("http://", 0) == 0 || lowered.rfind("https://", 0) == 0)
        {
            return trimmed;
        }

        return std::string("http://") + trimmed;
    }
}

void RLTrainingJournalPlugin::onLoad()
{
    DiagnosticLogger::Log("onLoad: start");
    if (cvarManager)
    {
        cvarManager->log("RTJ: onLoad() starting");
        DiagnosticLogger::Log("onLoad: cvarManager present");
    } else {
        DiagnosticLogger::Log("onLoad: cvarManager null");
    }

    RegisterCVars();
    LoadPersistedSettings();

    DiagnosticLogger::Log("onLoad: RegisterCVars completed");
    if (cvarManager)
    {
        cvarManager->log("RTJ: registered CVars");
    }

    HookMatchEvents();

    DiagnosticLogger::Log("onLoad: HookMatchEvents completed");
    if (cvarManager)
    {
        cvarManager->log("RTJ: hooked match events");
    }

    try
    {
        std::string baseUrl = cvarManager ? cvarManager->getCvar(kBaseUrlCvarName).getStringValue() : std::string();
        DiagnosticLogger::Log(std::string("onLoad: creating ApiClient with baseUrl=") + baseUrl);
        apiClient = std::make_unique<ApiClient>(baseUrl);
        DiagnosticLogger::Log("onLoad: ApiClient created");
        if (cvarManager)
        {
            cvarManager->log("RTJ: ApiClient created");
        }
    }
    catch (const std::exception& ex)
    {
        DiagnosticLogger::Log(std::string("onLoad: exception creating ApiClient: ") + ex.what());
        if (cvarManager)
        {
            cvarManager->log(std::string("RTJ: exception creating ApiClient: ") + ex.what());
        }
    }

    DiagnosticLogger::Log("onLoad: complete");
    if (cvarManager)
    {
        cvarManager->log("Hardstuck plugin loaded");
    }
}

void RLTrainingJournalPlugin::onUnload()
{
    SavePersistedSettings();
    std::lock_guard<std::mutex> lock(requestMutex);
    pendingRequests.clear();
    apiClient.reset();

    if (gameWrapper)
    {
        gameWrapper->UnregisterDrawables();
        DiagnosticLogger::Log("onUnload: unregistered drawables");
        if (cvarManager)
        {
            cvarManager->log("RTJ: unregistered drawables");
        }
    }
}

void RLTrainingJournalPlugin::RegisterCVars()
{
    if (!cvarManager)
    {
        DiagnosticLogger::Log("RegisterCVars: cvarManager unavailable, skipping CVar registration");
        return;
    }

    auto baseUrl = cvarManager->registerCvar(kBaseUrlCvarName, kDefaultBaseUrl, "Base URL for the Hardstuck API");

    auto forceLocalhost = cvarManager->registerCvar(kForceLocalhostCvarName, "1", "Force uploads to http://localhost:4000");
    try {
        forceLocalhost_ = forceLocalhost.getBoolValue();
    } catch(...) { forceLocalhost_ = true; }
    if (forceLocalhost_)
    {
        ApplyBaseUrl(kLocalhostBaseUrl);
    }
    else
    {
        ApplyBaseUrl(baseUrl.getStringValue());
    }

    cvarManager->registerCvar(kUiEnabledCvarName, "1", "Legacy UI toggle (window now follows togglemenu)");
    cvarManager->registerCvar("rtj_ui_debug_show_demo", "0", "Show ImGui demo window for debugging (1 = show)");

    cvarManager->registerCvar(kUserIdCvarName, "test-player", "User identifier sent as X-User-Id when uploading matches");
    cvarManager->registerCvar(kGamesPlayedCvarName, "1", "Increment for gamesPlayedDiff payload field");

    // notifier stub omitted
}

void RLTrainingJournalPlugin::HookMatchEvents()
{
    if (!gameWrapper)
    {
        DiagnosticLogger::Log("HookMatchEvents: gameWrapper unavailable");
        return;
    }

    using std::placeholders::_1;

    gameWrapper->HookEventPost("Function TAGame.GameEvent_Soccar_TA.EventMatchEnded",
                               std::bind(&RLTrainingJournalPlugin::HandleGameEnd, this, _1));
    gameWrapper->HookEventPost("Function TAGame.GameEvent_Soccar_TA.Destroyed",
                               std::bind(&RLTrainingJournalPlugin::HandleGameEnd, this, _1));
    gameWrapper->HookEventPost("Function TAGame.ReplayDirector_TA.EventReplayFinished",
                               std::bind(&RLTrainingJournalPlugin::HandleReplayRecorded, this, _1));
    gameWrapper->HookEventPost("Function TAGame.ReplayDirector_TA.EventStopReplay",
                               std::bind(&RLTrainingJournalPlugin::HandleReplayRecorded, this, _1));
    DiagnosticLogger::Log("HookMatchEvents: registered automatic upload hooks");
}

void RLTrainingJournalPlugin::HandleGameEnd(std::string eventName)
{
    DiagnosticLogger::Log(std::string("HandleGameEnd: received ") + eventName);
    if (!gameWrapper)
    {
        return;
    }

    gameWrapper->Execute([this](GameWrapper* gw) {
        ServerWrapper server = ResolveActiveServer(gw);
        if (!CaptureServerAndUpload(server, "match_end"))
        {
            DiagnosticLogger::Log("HandleGameEnd: no active server to capture");
        }
    });
}

void RLTrainingJournalPlugin::HandleReplayRecorded(std::string eventName)
{
    DiagnosticLogger::Log(std::string("HandleReplayRecorded: received ") + eventName);
    if (!gameWrapper)
    {
        return;
    }

    gameWrapper->Execute([this](GameWrapper* gw) {
        ServerWrapper server = gw ? gw->GetGameEventAsServer() : ServerWrapper(0);
        if (!CaptureServerAndUpload(server, "replay_recorded"))
        {
            DiagnosticLogger::Log("HandleReplayRecorded: unable to capture replay server");
        }
    });
}

std::string RLTrainingJournalPlugin::FormatTimestamp(const std::chrono::system_clock::time_point& timePoint) const
{
    std::time_t now = std::chrono::system_clock::to_time_t(timePoint);
    std::tm tmUtc;
#ifdef _WIN32
    gmtime_s(&tmUtc, &now);
#else
    gmtime_r(&now, &tmUtc);
#endif

    std::ostringstream oss;
    oss << std::put_time(&tmUtc, "%Y-%m-%dT%H:%M:%SZ");
    return oss.str();
}

std::string RLTrainingJournalPlugin::Escape(const std::string& value) const
{
    std::ostringstream oss;
    oss << '"';
    for (char c : value)
    {
        switch (c)
        {
        case '\\':
            oss << "\\\\";
            break;
        case '"':
            oss << "\\\"";
            break;
        case '\n':
            oss << "\\n";
            break;
        case '\r':
            oss << "\\r";
            break;
        case '\t':
            oss << "\\t";
            break;
        default:
            oss << c;
            break;
        }
    }
    oss << '"';
    return oss.str();
}

std::string RLTrainingJournalPlugin::PlaylistNameFromServer(ServerWrapper server) const
{
    if (!server)
    {
        return "Unknown";
    }
    GameSettingPlaylistWrapper playlist = server.GetPlaylist();
    if (playlist)
    {
        std::string name;
        try {
            name = playlist.GetLocalizedName();
        } catch(...) { }
        if (name.empty()) {
            try { name = playlist.GetName(); } catch(...) { }
        }

        if (!name.empty())
        {
            return name;
        }

        const int playlistId = playlist.GetPlaylistId();
        static const std::unordered_map<int, std::string> playlistNames = {
            {1, "Ranked Duel"},
            {2, "Ranked Doubles"},
            {3, "Ranked Standard"},
            {4, "Ranked 4v4"},
            {8, "Hoops"},
            {10, "Rumble"},
            {11, "Dropshot"},
            {13, "Snow Day"},
            {34, "Tournament"}
        };

        auto it = playlistNames.find(playlistId);
        if (it != playlistNames.end())
        {
            return it->second;
        }
    }

    return "Unknown";
}

std::string RLTrainingJournalPlugin::SerializeTeams(ServerWrapper server) const
{
    std::ostringstream oss;
    oss << '[';

    if (server)
    {
        ArrayWrapper<TeamWrapper> teams = server.GetTeams();
        bool firstTeam = true;
        for (int i = 0; i < teams.Count(); ++i)
        {
            TeamWrapper team = teams.Get(i);
            if (!team)
            {
                continue;
            }

            if (!firstTeam)
            {
                oss << ',';
            }
            firstTeam = false;

            const int teamIndex = team.GetTeamNum();
            const int score = team.GetScore();
            const std::string name = teamIndex == 1 ? "Orange" : "Blue";

            oss << '{'
                << "\"teamIndex\":" << teamIndex << ','
                << "\"name\":" << Escape(name) << ','
                << "\"score\":" << score
                << '}';
        }
    }

    oss << ']';
    return oss.str();
}

std::string RLTrainingJournalPlugin::SerializeScoreboard(ServerWrapper server) const
{
    std::ostringstream oss;
    oss << '[';

    if (server)
    {
        ArrayWrapper<CarWrapper> cars = server.GetCars();
        bool first = true;
        for (int i = 0; i < cars.Count(); ++i)
        {
            CarWrapper car = cars.Get(i);
            if (!car)
            {
                continue;
            }

            PriWrapper pri = car.GetPRI();
            if (!pri)
            {
                continue;
            }

            if (!first)
            {
                oss << ',';
            }
            first = false;

            const std::string playerName = pri.GetPlayerName().IsNull() ? std::string("Unknown") : pri.GetPlayerName().ToString();
            const int teamIndex = pri.GetTeamNum();
            const int score = pri.GetMatchScore();
            const int goals = pri.GetMatchGoals();
            const int assists = pri.GetMatchAssists();
            const int saves = pri.GetMatchSaves();
            const int shots = pri.GetMatchShots();

            oss << '{'
                << "\"name\":" << Escape(playerName) << ','
                << "\"teamIndex\":" << teamIndex << ','
                << "\"score\":" << score << ','
                << "\"goals\":" << goals << ','
                << "\"assists\":" << assists << ','
                << "\"saves\":" << saves << ','
                << "\"shots\":" << shots
                << '}';
        }
    }

    oss << ']';
    return oss.str();
}

std::string RLTrainingJournalPlugin::BuildMatchPayload(ServerWrapper server) const
{
    const auto now = std::chrono::system_clock::now();
    const std::string timestamp = FormatTimestamp(now);
    const std::string playlistName = PlaylistNameFromServer(server);
    const int gamesPlayedDiff = cvarManager ? cvarManager->getCvar(kGamesPlayedCvarName).getIntValue() : 1;

    float mmr = 0.0f;
    if (gameWrapper)
    {
        auto mmrWrapper = gameWrapper->GetMMRWrapper();
        if (mmrWrapper.memory_address != 0)
        {
            GameSettingPlaylistWrapper playlist = server.GetPlaylist();
            const int playlistId = playlist ? playlist.GetPlaylistId() : 0;
            UniqueIDWrapper uniqueId = gameWrapper->GetUniqueID();
            bool hasUniqueId = false;
            try {
                hasUniqueId = (uniqueId.GetUID() != 0) || (!uniqueId.GetEpicAccountID().empty());
            } catch(...) { hasUniqueId = false; }
            if (hasUniqueId)
            {
                mmr = mmrWrapper.GetPlayerMMR(uniqueId, playlistId);
            }
        }
    }

    std::ostringstream oss;
    oss << '{'
        << "\"timestamp\":" << Escape(timestamp) << ','
        << "\"playlist\":" << Escape(playlistName) << ','
        << "\"mmr\":" << static_cast<int>(std::round(mmr)) << ','
        << "\"gamesPlayedDiff\":" << gamesPlayedDiff << ','
        << "\"source\":\"bakkes\",";

    const std::string userId = cvarManager ? cvarManager->getCvar(kUserIdCvarName).getStringValue() : std::string("unknown");
    oss << "\"userId\":" << Escape(userId) << ',';

    oss << "\"teams\":" << SerializeTeams(server) << ',';
    oss << "\"scoreboard\":" << SerializeScoreboard(server);
    oss << '}';

    return oss.str();
}

bool RLTrainingJournalPlugin::HasValidUniqueId(UniqueIDWrapper& uniqueId) const
{
    bool hasUniqueId = false;
    try
    {
        hasUniqueId = (uniqueId.GetUID() != 0);
    }
    catch (...)
    {
        hasUniqueId = false;
    }

    if (!hasUniqueId)
    {
        try
        {
            hasUniqueId = !uniqueId.GetEpicAccountID().empty();
        }
        catch (...)
        {
            hasUniqueId = false;
        }
    }

    return hasUniqueId;
}

std::vector<std::string> RLTrainingJournalPlugin::BuildMmrSnapshotPayloads() const
{
    std::vector<std::string> payloads;

    if (!gameWrapper)
    {
        DiagnosticLogger::Log("BuildMmrSnapshotPayloads: gameWrapper unavailable");
        return payloads;
    }

    auto mmrWrapper = gameWrapper->GetMMRWrapper();
    if (mmrWrapper.memory_address == 0)
    {
        DiagnosticLogger::Log("BuildMmrSnapshotPayloads: mmrWrapper invalid");
        return payloads;
    }

    UniqueIDWrapper uniqueId = gameWrapper->GetUniqueID();
    if (!HasValidUniqueId(uniqueId))
    {
        DiagnosticLogger::Log("BuildMmrSnapshotPayloads: unique id not available");
        return payloads;
    }

    struct PlaylistTarget
    {
        int playlistId;
        const char* name;
    };

    static const PlaylistTarget kPlaylistTargets[] = {
        {1, "Ranked Duel"},
        {2, "Ranked Doubles"},
        {3, "Ranked Standard"},
        {4, "Ranked 4v4"},
        {7, "Duel (Legacy)"},
        {8, "Hoops"},
        {10, "Rumble"},
        {11, "Dropshot"},
        {12, "Faceoff"},
        {13, "Snow Day"},
        {27, "Tournament (2v2)"},
        {28, "Tournament (3v3)"},
        {34, "Tournament"},
    };

    const auto now = std::chrono::system_clock::now();
    const std::string timestamp = FormatTimestamp(now);
    const std::string userId = cvarManager ? cvarManager->getCvar(kUserIdCvarName).getStringValue() : std::string("unknown");

    for (const auto& target : kPlaylistTargets)
    {
        float rating = 0.0f;
        try
        {
            rating = mmrWrapper.GetPlayerMMR(uniqueId, target.playlistId);
        }
        catch (...)
        {
            rating = 0.0f;
        }

        if (rating <= 0.0f)
        {
            continue;
        }

        std::ostringstream oss;
        oss << '{'
            << "\"timestamp\":" << Escape(timestamp) << ','
            << "\"playlist\":" << Escape(target.name) << ','
            << "\"mmr\":" << static_cast<int>(std::round(rating)) << ','
            << "\"gamesPlayedDiff\":0,"
            << "\"source\":\"bakkes_snapshot\","
            << "\"userId\":" << Escape(userId) << ','
            << "\"teams\":[],"
            << "\"scoreboard\":[]"
            << '}';

        payloads.emplace_back(oss.str());
    }

    if (payloads.empty())
    {
        DiagnosticLogger::Log("BuildMmrSnapshotPayloads: no playlists produced valid ratings");
    }

    return payloads;
}

bool RLTrainingJournalPlugin::UploadMmrSnapshot(const char* contextTag)
{
    const std::vector<std::string> payloads = BuildMmrSnapshotPayloads();
    if (payloads.empty())
    {
        DiagnosticLogger::Log(std::string("UploadMmrSnapshot: no payloads generated for context ") + (contextTag ? contextTag : "n/a"));
        return false;
    }

    DiagnosticLogger::Log(std::string("UploadMmrSnapshot: sending ") + std::to_string(payloads.size()) +
                          " playlist snapshots for context " + (contextTag ? contextTag : "n/a"));
    for (const auto& payload : payloads)
    {
        DispatchPayloadAsync("/api/mmr-log", payload);
    }
    return true;
}

void RLTrainingJournalPlugin::DispatchPayloadAsync(const std::string& endpoint, const std::string& body)
{
    if (!apiClient)
    {
        if (cvarManager)
        {
            cvarManager->log("RTJ: API client is not configured");
        }
        return;
    }

    DiagnosticLogger::Log(std::string("DispatchPayloadAsync: endpoint=") + endpoint + ", body_len=" + std::to_string(body.size()));

    CleanupFinishedRequests();

    const std::string userId = cvarManager ? cvarManager->getCvar(kUserIdCvarName).getStringValue() : std::string();
    std::vector<HttpHeader> headers;
    headers.emplace_back("X-User-Id", userId);
    headers.emplace_back("User-Agent", "RLTrainingJournalPlugin/1.0");

    auto future = std::async(std::launch::async, [this, endpoint, body, headers]() {
        std::string response;
        bool success = apiClient->PostJson(endpoint, body, headers, response);

        std::lock_guard<std::mutex> lock(requestMutex);
        if (success)
        {
            lastResponseMessage = response.empty() ? "HTTP 2xx" : response;
            lastErrorMessage.clear();
        }
        else
        {
            lastErrorMessage = response;
        }
    });

    std::lock_guard<std::mutex> lock(requestMutex);
    pendingRequests.emplace_back(std::move(future));
}

void RLTrainingJournalPlugin::CleanupFinishedRequests()
{
    std::lock_guard<std::mutex> lock(requestMutex);
    pendingRequests.erase(std::remove_if(pendingRequests.begin(), pendingRequests.end(), [](std::future<void>& future) {
                            return future.valid() && future.wait_for(std::chrono::seconds(0)) == std::future_status::ready;
                        }),
                        pendingRequests.end());
}

bool RLTrainingJournalPlugin::ShouldBlockInput()
{
    return false;
}

bool RLTrainingJournalPlugin::IsActiveOverlay()
{
    return true;
}

void RLTrainingJournalPlugin::OnOpen()
{
    menuOpen_ = true;
}

void RLTrainingJournalPlugin::OnClose()
{
    menuOpen_ = false;
}

void RLTrainingJournalPlugin::Render()
{
    DiagnosticLogger::Log("Render: entered");
    if (!menuOpen_)
    {
        DiagnosticLogger::Log("Render: menu closed, skipping draw");
        return;
    }
    std::string lastResponse;
    std::string lastError;
    {
        std::lock_guard<std::mutex> lock(requestMutex);
        lastResponse = lastResponseMessage;
        lastError = lastErrorMessage;
    }
    if (imguiContext_)
    {
        DiagnosticLogger::Log(std::string("Render: setting context ptr=") + std::to_string(reinterpret_cast<uintptr_t>(imguiContext_)));
        ImGui::SetCurrentContext(imguiContext_);
    }

    if (ImGui::GetCurrentContext() == nullptr)
    {
        DiagnosticLogger::Log("Render: ImGui context not available, skipping UI calls");
        return;
    }

    bool showDemo = false;
    if (cvarManager)
    {
        try {
            showDemo = cvarManager->getCvar("rtj_ui_debug_show_demo").getBoolValue();
        } catch(...) { showDemo = false; }
    }
    if (showDemo)
    {
        DiagnosticLogger::Log("Render: showing ImGui demo window");
        ImGui::ShowDemoWindow(&showDemo);
    }

    DiagnosticLogger::Log("Render: calling ImGui::Begin");
    bool beginResult = ImGui::Begin("Hardstuck — Rocket League Training Journal##overlay", nullptr, ImGuiWindowFlags_AlwaysAutoResize);
    DiagnosticLogger::Log(std::string("Render: ImGui::Begin returned ") + (beginResult ? "true" : "false"));
    if (!beginResult)
    {
        ImGui::End();
        return;
    }

    ImGui::TextWrapped("Uploads match summaries to the Hardstuck (Rocket League Training Journal) API.");
    if (!lastResponse.empty())
    {
        ImGui::TextWrapped("Last response: %s", lastResponse.c_str());
    }
    if (!lastError.empty())
    {
        ImGui::TextWrapped("Last error: %s", lastError.c_str());
    }

    if (ImGui::Button("Gather && Upload Now"))
    {
        TriggerManualUpload();
    }

    ImGui::End();
}

void RLTrainingJournalPlugin::RenderSettings()
{
    DiagnosticLogger::Log("RenderSettings: entered");
    if (imguiContext_)
    {
        DiagnosticLogger::Log(std::string("RenderSettings: setting context ptr=") + std::to_string(reinterpret_cast<uintptr_t>(imguiContext_)));
        ImGui::SetCurrentContext(imguiContext_);
    }

    if (ImGui::GetCurrentContext() == nullptr)
    {
        DiagnosticLogger::Log("RenderSettings: ImGui context not available, skipping");
        return;
    }

    if (!cvarManager)
    {
        ImGui::TextWrapped("CVar manager unavailable; settings UI cannot function.");
        return;
    }

    ImGui::TextUnformatted("Configure where Hardstuck uploads are sent.");

    static char baseUrlBuf[256] = {0};
    static char userIdBuf[128] = {0};
    static std::string cachedBaseUrl;
    static std::string cachedUserId;

    try {
        const std::string cvarBase = cvarManager->getCvar(kBaseUrlCvarName).getStringValue();
        const std::string cvarUser = cvarManager->getCvar(kUserIdCvarName).getStringValue();

        if (cachedBaseUrl != cvarBase)
        {
            SafeStrCopy(baseUrlBuf, cvarBase, sizeof(baseUrlBuf));
            cachedBaseUrl = cvarBase;
        }

        if (cachedUserId != cvarUser)
        {
            SafeStrCopy(userIdBuf, cvarUser, sizeof(userIdBuf));
            cachedUserId = cvarUser;
        }
    } catch(...) {
        // best-effort; fall back to buffers
    }

    bool localhostToggle = forceLocalhost_;
    if (ImGui::Checkbox("Send uploads to localhost (development only)", &localhostToggle))
    {
        try {
            cvarManager->getCvar(kForceLocalhostCvarName).setValue(localhostToggle ? "1" : "0");
        } catch(...) {
            DiagnosticLogger::Log("RenderSettings: failed to set force_localhost cvar (not registered)");
        }
        forceLocalhost_ = localhostToggle;
        if (forceLocalhost_)
        {
            ApplyBaseUrl(kLocalhostBaseUrl);
            SafeStrCopy(baseUrlBuf, kLocalhostBaseUrl, sizeof(baseUrlBuf));
            cachedBaseUrl = kLocalhostBaseUrl;
        }
        else if (cachedBaseUrl.empty() || cachedBaseUrl == kLocalhostBaseUrl)
        {
            ApplyBaseUrl(kLanBaseUrl);
            SafeStrCopy(baseUrlBuf, kLanBaseUrl, sizeof(baseUrlBuf));
            cachedBaseUrl = kLanBaseUrl;
        }
        SavePersistedSettings();
    }
    ImGui::SameLine();
    ImGui::TextWrapped("Leave unchecked to target your LAN API (e.g. 192.168.1.236:4000).");

    if (localhostToggle)
    {
        ImGui::TextWrapped("API Base URL: %s", baseUrlBuf);
        ImGui::TextWrapped("(Locked to localhost while the checkbox is enabled.)");
    }
    else
    {
        ImGui::InputText("API Base URL", baseUrlBuf, sizeof(baseUrlBuf));
        ImGui::SameLine();
        if (ImGui::Button("Save URL"))
        {
            const std::string sanitized = EnsureHttpScheme(baseUrlBuf);
            ApplyBaseUrl(sanitized);
            SafeStrCopy(baseUrlBuf, sanitized, sizeof(baseUrlBuf));
            cachedBaseUrl = sanitized;
            cvarManager->log("RTJ: saved API base URL");
            SavePersistedSettings();
        }
    }

    ImGui::InputText("User ID (X-User-Id)", userIdBuf, sizeof(userIdBuf));
    ImGui::SameLine();
    if (ImGui::Button("Save User ID"))
    {
        try {
            cvarManager->getCvar(kUserIdCvarName).setValue(std::string(userIdBuf));
            cachedUserId = userIdBuf;
            cvarManager->log("RTJ: saved user id");
            SavePersistedSettings();
        } catch(...) {
            DiagnosticLogger::Log("RenderSettings: failed to save user id cvar (not registered)");
        }
    }

    ImGui::Spacing();
    ImGui::TextWrapped("Quick helpers:");
    if (ImGui::Button("Use LAN API (192.168.1.236:4000)"))
    {
        ApplyBaseUrl(kLanBaseUrl);
        SafeStrCopy(baseUrlBuf, kLanBaseUrl, sizeof(baseUrlBuf));
        cachedBaseUrl = kLanBaseUrl;
        try {
            cvarManager->getCvar(kForceLocalhostCvarName).setValue("0");
        } catch(...) {
            DiagnosticLogger::Log("RenderSettings: failed to clear force_localhost cvar (not registered)");
        }
        forceLocalhost_ = false;
        localhostToggle = false;
        SavePersistedSettings();
    }
    ImGui::SameLine();
    ImGui::TextWrapped("Use when the training app runs on the LAN machine.");

    if (ImGui::Button("Use localhost:4000"))
    {
        ApplyBaseUrl(kLocalhostBaseUrl);
        SafeStrCopy(baseUrlBuf, kLocalhostBaseUrl, sizeof(baseUrlBuf));
        cachedBaseUrl = kLocalhostBaseUrl;
        try {
            cvarManager->getCvar(kForceLocalhostCvarName).setValue("1");
        } catch(...) {
            DiagnosticLogger::Log("RenderSettings: failed to set force_localhost cvar (not registered)");
        }
        forceLocalhost_ = true;
        localhostToggle = true;
        SavePersistedSettings();
    }
    ImGui::SameLine();
    ImGui::TextWrapped("Use only when the API runs on this Rocket League PC.");

    ImGui::Spacing();
    if (ImGui::Button("Gather && Upload Now"))
    {
        TriggerManualUpload();
    }
    ImGui::SameLine();
    ImGui::TextWrapped("Captures the active match/replay and immediately syncs it.");

    ImGui::Spacing();
    ImGui::TextWrapped("Tip: Set the API URL to the LAN IP of the machine running the training app (for example: http://192.168.1.236:4000) when streaming data across devices.");

}

std::string RLTrainingJournalPlugin::GetPluginName()
{
    return "Hardstuck";
}

std::string RLTrainingJournalPlugin::GetMenuName()
{
    return "rltrainingjournal"; // internal menu name (no spaces)
}

std::string RLTrainingJournalPlugin::GetMenuTitle()
{
    return "Hardstuck"; // title shown in the BakkesMod menu
}

void RLTrainingJournalPlugin::SetImGuiContext(uintptr_t ctx)
{
    // Store the context pointer so we can bind it on whichever thread renders.
    imguiContext_ = reinterpret_cast<ImGuiContext*>(ctx);
    ImGui::SetCurrentContext(imguiContext_);
    DiagnosticLogger::Log(std::string("SetImGuiContext: set context ptr=") + std::to_string(reinterpret_cast<uintptr_t>(imguiContext_)));
}

void RLTrainingJournalPlugin::ApplyBaseUrl(const std::string& newUrl)
{
    const std::string sanitized = EnsureHttpScheme(newUrl);

    if (cvarManager)
    {
        try
        {
            auto baseCvar = cvarManager->getCvar(kBaseUrlCvarName);
            baseCvar.setValue(sanitized);
        }
        catch (...)
        {
        }
    }

    if (apiClient)
    {
        apiClient->SetBaseUrl(sanitized);
    }
}

void RLTrainingJournalPlugin::TriggerManualUpload()
{
    if (!gameWrapper)
    {
        if (cvarManager)
        {
            cvarManager->log("RTJ: no game wrapper");
        }
        return;
    }

    gameWrapper->Execute([this](GameWrapper* gw) {
        ServerWrapper server = ResolveActiveServer(gw);
        if (CaptureServerAndUpload(server, "manual_sync"))
        {
            if (cvarManager)
            {
                cvarManager->log("RTJ: manual sync uploaded active match data");
            }
            return;
        }

        if (UploadMmrSnapshot("manual_sync"))
        {
            if (cvarManager)
            {
                cvarManager->log("RTJ: manual sync uploaded current ranked MMR snapshot");
            }
            return;
        }

        if (DispatchCachedPayload("manual_sync"))
        {
            if (cvarManager)
            {
                cvarManager->log("RTJ: manual sync used last cached match payload");
            }
        }
        else if (cvarManager)
        {
            cvarManager->log("RTJ: manual sync could not gather any match or snapshot data");
        }
    });
}

ServerWrapper RLTrainingJournalPlugin::ResolveActiveServer(GameWrapper* gw) const
{
    if (!gw)
    {
        return ServerWrapper(0);
    }

    ServerWrapper server = gw->GetOnlineGame();
    if (!server)
    {
        server = gw->GetGameEventAsServer();
    }
    return server;
}

bool RLTrainingJournalPlugin::CaptureServerAndUpload(ServerWrapper server, const char* contextTag)
{
    const char* tag = contextTag ? contextTag : "unknown";
    if (!server)
    {
        DiagnosticLogger::Log(std::string("CaptureServerAndUpload: server invalid for context ") + tag);
        return false;
    }

    const std::string payload = BuildMatchPayload(server);
    DiagnosticLogger::Log(std::string("CaptureServerAndUpload: context=") + tag + ", payload_len=" + std::to_string(payload.size()));
    CacheLastPayload(payload, tag);
    DispatchPayloadAsync("/api/mmr-log", payload);
    return true;
}

void RLTrainingJournalPlugin::CacheLastPayload(const std::string& payload, const char* contextTag)
{
    std::lock_guard<std::mutex> lock(payloadMutex_);
    lastPayload_ = payload;
    lastPayloadContext_ = contextTag ? contextTag : "";
}

bool RLTrainingJournalPlugin::DispatchCachedPayload(const char* reason)
{
    std::string cached;
    std::string context;
    {
        std::lock_guard<std::mutex> lock(payloadMutex_);
        cached = lastPayload_;
        context = lastPayloadContext_;
    }

    if (cached.empty())
    {
        DiagnosticLogger::Log(std::string("DispatchCachedPayload: no cached payload (reason=") + (reason ? reason : "n/a") + ")");
        return false;
    }

    DiagnosticLogger::Log(std::string("DispatchCachedPayload: sending cached payload captured during ") + context +
                          ", reason=" + (reason ? reason : "n/a"));
    DispatchPayloadAsync("/api/mmr-log", cached);
    return true;
}

std::filesystem::path RLTrainingJournalPlugin::GetSettingsPath() const
{
    std::filesystem::path base;
#ifdef _WIN32
    char* appdata_env = nullptr;
    size_t env_len = 0;
    if (_dupenv_s(&appdata_env, &env_len, "APPDATA") == 0 && appdata_env && appdata_env[0] != '\0')
    {
        base = appdata_env;
    }
    if (appdata_env)
    {
        free(appdata_env);
    }
#else
    const char* appdata_env = std::getenv("APPDATA");
    if (appdata_env && appdata_env[0] != '\0')
    {
        base = appdata_env;
    }
#endif
    if (base.empty())
    {
        base = std::filesystem::temp_directory_path();
    }

    return base / "bakkesmod" / "rltrainingjournal" / "settings.cfg";
}

void RLTrainingJournalPlugin::LoadPersistedSettings()
{
    const std::filesystem::path path = GetSettingsPath();
    std::ifstream input(path);
    if (!input.is_open())
    {
        DiagnosticLogger::Log(std::string("LoadPersistedSettings: missing settings file at ") + path.string());
        SavePersistedSettings();
        return;
    }

    std::string line;
    std::string fileBaseUrl;
    std::string fileUserId;
    bool hasForce = false;
    bool forcedValue = forceLocalhost_;

    while (std::getline(input, line))
    {
        const std::string trimmedLine = Trimmed(line);
        if (trimmedLine.empty() || trimmedLine[0] == '#')
        {
            continue;
        }

        const auto eqPos = trimmedLine.find('=');
        if (eqPos == std::string::npos)
        {
            continue;
        }

        const std::string key = Trimmed(trimmedLine.substr(0, eqPos));
        const std::string value = Trimmed(trimmedLine.substr(eqPos + 1));

        if (key == "base_url")
        {
            fileBaseUrl = value;
        }
        else if (key == "user_id")
        {
            fileUserId = value;
        }
        else if (key == "force_localhost")
        {
            hasForce = true;
            std::string lowered = value;
            std::transform(lowered.begin(), lowered.end(), lowered.begin(), [](unsigned char ch) {
                return static_cast<char>(std::tolower(ch));
            });
            forcedValue = (lowered == "1" || lowered == "true" || lowered == "yes");
        }
    }

    if (hasForce)
    {
        forceLocalhost_ = forcedValue;
        if (cvarManager)
        {
            try
            {
                cvarManager->getCvar(kForceLocalhostCvarName).setValue(forceLocalhost_ ? "1" : "0");
            }
            catch (...)
            {
            }
        }
    }

    if (!fileBaseUrl.empty())
    {
        const std::string sanitized = EnsureHttpScheme(fileBaseUrl);
        ApplyBaseUrl(sanitized);
        if (cvarManager)
        {
            try
            {
                cvarManager->getCvar(kBaseUrlCvarName).setValue(sanitized);
            }
            catch (...)
            {
            }
        }
    }

    if (!fileUserId.empty() && cvarManager)
    {
        try
        {
            cvarManager->getCvar(kUserIdCvarName).setValue(fileUserId);
        }
        catch (...)
        {
        }
    }
}

void RLTrainingJournalPlugin::SavePersistedSettings()
{
    const std::filesystem::path path = GetSettingsPath();
    std::error_code ec;
    std::filesystem::create_directories(path.parent_path(), ec);

    std::ofstream output(path, std::ios::out | std::ios::trunc);
    if (!output.is_open())
    {
        DiagnosticLogger::Log(std::string("SavePersistedSettings: failed to open settings file at ") + path.string());
        return;
    }

    std::string baseValue;
    std::string userValue;
    if (cvarManager)
    {
        try
        {
            baseValue = cvarManager->getCvar(kBaseUrlCvarName).getStringValue();
        }
        catch (...)
        {
            baseValue.clear();
        }

        try
        {
            userValue = cvarManager->getCvar(kUserIdCvarName).getStringValue();
        }
        catch (...)
        {
            userValue.clear();
        }
    }

    output << "base_url=" << baseValue << "\n";
    output << "force_localhost=" << (forceLocalhost_ ? "1" : "0") << "\n";
    output << "user_id=" << userValue << "\n";
}
