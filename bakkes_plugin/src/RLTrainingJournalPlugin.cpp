#include "RLTrainingJournalPlugin.h"
#include "DiagnosticLogger.h"

#include "bakkesmod/wrappers/GameWrapper.h"
#include "bakkesmod/wrappers/ArrayWrapper.h"
#include "bakkesmod/wrappers/CarWrapper.h"
#include "bakkesmod/wrappers/PriWrapper.h"
#include "bakkesmod/wrappers/TeamWrapper.h"
#include "bakkesmod/wrappers/PlaylistWrapper.h"
#include "bakkesmod/wrappers/MMRWrapper.h"
#include "bakkesmod/wrappers/UniqueIDWrapper.h"
#include "bakkesmod/wrappers/UnrealStringWrapper.h"

#include "../third_party/imgui/imgui.h"

#include <algorithm>
#include <cmath>
#include <ctime>
#include <cstring>
#include <future>
#include <iomanip>
#include <sstream>
#include <thread>
#include <unordered_map>

BAKKESMOD_PLUGIN(RLTrainingJournalPlugin, "RL Trainer", "1.0", PERMISSION_ALL)

namespace
{
    constexpr char kBaseUrlCvarName[] = "rtj_api_base_url";
    constexpr char kForceLocalhostCvarName[] = "rtj_force_localhost";
    constexpr char kUserIdCvarName[] = "rtj_user_id";
    constexpr char kGamesPlayedCvarName[] = "rtj_games_played_increment";
    constexpr char kUiEnabledCvarName[] = "rtj_ui_enabled";
    constexpr char kDefaultBaseUrl[] = "http://localhost:4000";
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
        cvarManager->log("RL Training Journal plugin loaded");
    }
}

void RLTrainingJournalPlugin::onUnload()
{
    std::lock_guard<std::mutex> lock(requestMutex);
    pendingRequests.clear();
    apiClient.reset();
}

void RLTrainingJournalPlugin::RegisterCVars()
{
    auto baseUrl = cvarManager->registerCvar(kBaseUrlCvarName, kDefaultBaseUrl, "Base URL for the RL Training Journal API");
    baseUrl.addOnValueChanged([this](std::string, CVarWrapper cvar) {
        if (apiClient)
        {
            apiClient->SetBaseUrl(cvar.getStringValue());
        }
    });

    auto forceLocalhost = cvarManager->registerCvar(kForceLocalhostCvarName, "1", "Force uploads to http://localhost:4000");
    forceLocalhost.addOnValueChanged([this](std::string, CVarWrapper cvar) {
        try {
            forceLocalhost_ = cvar.getBoolValue();
        } catch(...) {
            forceLocalhost_ = true;
        }

        if (forceLocalhost_)
        {
            ApplyBaseUrl(kDefaultBaseUrl);
        }
    });

    // UI enable/disable CVar defaults to enabled so the ImGui window is visible
    // as soon as the plugin is loaded.
    auto uiEnabled = cvarManager->registerCvar(kUiEnabledCvarName, "1", "Enable plugin ImGui UI (1 = enabled, 0 = disabled)");
    uiEnabled.addOnValueChanged([this](std::string, CVarWrapper cvar) {
        try {
            uiEnabled_ = cvar.getBoolValue();
            DiagnosticLogger::Log(std::string("CVar rtj_ui_enabled changed: ") + (uiEnabled_ ? "1" : "0"));
        } catch(...) {
            DiagnosticLogger::Log("CVar rtj_ui_enabled: invalid value");
        }
    });

    // Initialize CVar-backed state from their persisted values.
    try {
        forceLocalhost_ = forceLocalhost.getBoolValue();
    } catch(...) { forceLocalhost_ = true; }
    if (forceLocalhost_)
    {
        ApplyBaseUrl(kDefaultBaseUrl);
    }

    try {
        uiEnabled_ = uiEnabled.getBoolValue();
    } catch(...) { uiEnabled_ = false; }

    cvarManager->registerCvar(kUserIdCvarName, "test-player", "User identifier sent as X-User-Id when uploading matches");
    cvarManager->registerCvar(kGamesPlayedCvarName, "1", "Increment for gamesPlayedDiff payload field");

    cvarManager->registerNotifier("rtj_force_upload", [this](std::vector<std::string>) {
        DiagnosticLogger::Log("notifier: rtj_force_upload invoked");
        if (!gameWrapper)
        {
            return;
        }

        ServerWrapper server = gameWrapper->GetOnlineGame();
        if (!server)
        {
            server = gameWrapper->GetGameEventAsServer();
        }

        if (!server)
        {
            cvarManager->log("RTJ: no active server to report");
            return;
        }

        TriggerManualUpload();
    }, "Immediately upload the current match payload", PERMISSION_ALL);
}

void RLTrainingJournalPlugin::HookMatchEvents()
{
    if (!gameWrapper)
    {
        return;
    }

    auto gameEnded = [this](ServerWrapper, void*, std::string) {
        HandleGameEnd("match_end");
    };

    gameWrapper->HookEventWithCallerPost<ServerWrapper>("Function TAGame.GameEvent_Soccar_TA.EventMatchEnded", gameEnded);
    gameWrapper->HookEventWithCallerPost<ServerWrapper>("Function TAGame.GameEvent_Soccar_TA.EventGameEnded", gameEnded);
    gameWrapper->HookEventWithCallerPost<ServerWrapper>("Function TAGame.GameEvent_TA.EventMatchEnded", gameEnded);

    gameWrapper->HookEventPost("Function TAGame.ReplayDirector_TA.RecordReplay", [this](std::string eventName) {
        HandleReplayRecorded(eventName);
    });
}

void RLTrainingJournalPlugin::HandleGameEnd(std::string)
{
    DiagnosticLogger::Log("HandleGameEnd: called");
    if (!gameWrapper)
    {
        return;
    }

    if (!gameWrapper->IsInOnlineGame() && !gameWrapper->IsInReplay())
    {
        return;
    }

    ServerWrapper server = gameWrapper->GetOnlineGame();
    if (!server)
    {
        server = gameWrapper->GetGameEventAsServer();
    }

    if (!server)
    {
        return;
    }

    const std::string payload = BuildMatchPayload(server);
    DiagnosticLogger::Log(std::string("HandleGameEnd: payload length=") + std::to_string(payload.size()));
    DispatchPayloadAsync("/api/mmr-log", payload);
}

void RLTrainingJournalPlugin::HandleReplayRecorded(std::string)
{
    DiagnosticLogger::Log("HandleReplayRecorded: called");
    if (!gameWrapper || !gameWrapper->IsInReplay())
    {
        return;
    }

    ServerWrapper server = gameWrapper->GetGameEventAsServer();
    if (!server)
    {
        return;
    }

    const std::string payload = BuildMatchPayload(server);
    DiagnosticLogger::Log(std::string("HandleReplayRecorded: payload length=") + std::to_string(payload.size()));
    DispatchPayloadAsync("/api/mmr-log", payload);
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
        case '\"':
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
    PlaylistWrapper playlist = server.GetPlaylist();
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
            {1, "Duel"},
            {2, "Doubles"},
            {3, "Standard"},
            {4, "Chaos"},
            {6, "Solo Standard"},
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
    const int gamesPlayedDiff = cvarManager->getCvar(kGamesPlayedCvarName).getIntValue();

    float mmr = 0.0f;
    if (gameWrapper)
    {
        MMRWrapper mmrWrapper = gameWrapper->GetMMRWrapper();
        if (mmrWrapper.memory_address != 0)
        {
            PlaylistWrapper playlist = server.GetPlaylist();
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

    const std::string userId = cvarManager->getCvar(kUserIdCvarName).getStringValue();
    oss << "\"userId\":" << Escape(userId) << ',';

    oss << "\"teams\":" << SerializeTeams(server) << ',';
    oss << "\"scoreboard\":" << SerializeScoreboard(server);
    oss << '}';

    return oss.str();
}

void RLTrainingJournalPlugin::DispatchPayloadAsync(const std::string& endpoint, const std::string& body)
{
    if (!apiClient)
    {
        cvarManager->log("RTJ: API client is not configured");
        return;
    }

    DiagnosticLogger::Log(std::string("DispatchPayloadAsync: endpoint=") + endpoint + ", body_len=" + std::to_string(body.size()));

    CleanupFinishedRequests();

    const std::string userId = cvarManager->getCvar(kUserIdCvarName).getStringValue();
    std::vector<HttpHeader> headers = {
        {"X-User-Id", userId},
        {"User-Agent", "RLTrainingJournalPlugin/1.0"}
    };

    auto future = std::async(std::launch::async, [this, endpoint, body, headers]() {
        std::string response;
        const bool success = apiClient->PostJson(endpoint, body, headers, response);

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

void RLTrainingJournalPlugin::Render()
{
    std::string lastResponse;
    std::string lastError;
    {
        std::lock_guard<std::mutex> lock(requestMutex);
        lastResponse = lastResponseMessage;
        lastError = lastErrorMessage;
    }
    // Ensure ImGui context is set for this thread before calling any ImGui APIs.
    if (imguiContext_)
    {
        ImGui::SetCurrentContext(imguiContext_);
    }

    // If UI is disabled via CVar, skip all ImGui calls immediately.
    if (!uiEnabled_)
    {
        DiagnosticLogger::Log("Render: UI disabled by rtj_ui_enabled CVar, skipping");
        return;
    }

    // Defensive logging: record thread id and ImGui context pointer for diagnostics.
    {
        std::ostringstream ss;
        ss << "Render: thread=" << std::this_thread::get_id() << " imgui_ctx=" << reinterpret_cast<uintptr_t>(ImGui::GetCurrentContext());
        DiagnosticLogger::Log(ss.str());
    }

    // Avoid calling ImGui if there's no current ImGui context (prevents crashes when host hasn't
    // created a context yet or when rendering is invoked outside a proper ImGui frame).
    if (ImGui::GetCurrentContext() == nullptr)
    {
        DiagnosticLogger::Log("Render: ImGui context not available, skipping UI calls");
        return;
    }

    if (!ImGui::Begin("RL Training Journal##overlay", nullptr, ImGuiWindowFlags_AlwaysAutoResize))
    {
        ImGui::End();
        return;
    }

    ImGui::TextWrapped("Uploads match summaries to the Rocket League Training Journal API.");
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
    // Ensure ImGui context is set for this thread before calling any ImGui APIs.
    if (imguiContext_)
    {
        ImGui::SetCurrentContext(imguiContext_);
    }

    // Defensive logging: record thread id and ImGui context pointer for diagnostics.
    {
        std::ostringstream ss;
        ss << "RenderSettings: thread=" << std::this_thread::get_id() << " imgui_ctx=" << reinterpret_cast<uintptr_t>(ImGui::GetCurrentContext());
        DiagnosticLogger::Log(ss.str());
    }

    // Guard against missing ImGui context; avoid crashes when the host hasn't set up ImGui.
    if (ImGui::GetCurrentContext() == nullptr)
    {
        DiagnosticLogger::Log("RenderSettings: ImGui context not available, skipping UI calls");
        return;
    }

    if (!cvarManager)
    {
        ImGui::TextWrapped("CVar manager unavailable; settings UI cannot function.");
        return;
    }

    ImGui::TextUnformatted("Configure where Rocket League Training Journal uploads are sent.");
    if (!uiEnabled_)
    {
        ImGui::PushStyleColor(ImGuiCol_Text, IM_COL32(255, 128, 0, 255));
        ImGui::TextWrapped("Note: Overlay rendering is disabled via rtj_ui_enabled.");
        ImGui::PopStyleColor();
        ImGui::Separator();
    }

    static char baseUrlBuf[256] = {0};
    static char userIdBuf[128] = {0};
    static std::string cachedBaseUrl;
    static std::string cachedUserId;

    const std::string cvarBase = cvarManager->getCvar(kBaseUrlCvarName).getStringValue();
    const std::string cvarUser = cvarManager->getCvar(kUserIdCvarName).getStringValue();

    if (cachedBaseUrl != cvarBase)
    {
        std::strncpy(baseUrlBuf, cvarBase.c_str(), sizeof(baseUrlBuf) - 1);
        baseUrlBuf[sizeof(baseUrlBuf) - 1] = '\0';
        cachedBaseUrl = cvarBase;
    }

    if (cachedUserId != cvarUser)
    {
        std::strncpy(userIdBuf, cvarUser.c_str(), sizeof(userIdBuf) - 1);
        userIdBuf[sizeof(userIdBuf) - 1] = '\0';
        cachedUserId = cvarUser;
    }

    bool localhostToggle = forceLocalhost_;
    if (ImGui::Checkbox("Send data to localhost (default)", &localhostToggle))
    {
        cvarManager->getCvar(kForceLocalhostCvarName).setValue(localhostToggle ? "1" : "0");
        forceLocalhost_ = localhostToggle;
    }
    ImGui::SameLine();
    ImGui::TextWrapped("Uncheck to enter a remote IP/host.");

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
            ApplyBaseUrl(baseUrlBuf);
            cachedBaseUrl = baseUrlBuf;
            cvarManager->log("RTJ: saved API base URL");
        }
    }

    ImGui::InputText("User ID (X-User-Id)", userIdBuf, sizeof(userIdBuf));
    ImGui::SameLine();
    if (ImGui::Button("Save User ID"))
    {
        cvarManager->getCvar(kUserIdCvarName).setValue(std::string(userIdBuf));
        cachedUserId = userIdBuf;
        cvarManager->log("RTJ: saved user id");
    }

    ImGui::Spacing();
    ImGui::TextWrapped("Quick helpers:");
    if (ImGui::Button("Use localhost:4000"))
    {
        ApplyBaseUrl(kDefaultBaseUrl);
        std::strncpy(baseUrlBuf, kDefaultBaseUrl, sizeof(baseUrlBuf) - 1);
        baseUrlBuf[sizeof(baseUrlBuf) - 1] = '\0';
        cachedBaseUrl = kDefaultBaseUrl;
        cvarManager->getCvar(kForceLocalhostCvarName).setValue("1");
        forceLocalhost_ = true;
        localhostToggle = true;
    }
    ImGui::SameLine();
    ImGui::TextWrapped("Use when the training app runs on the same PC.");

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
    return "RL Training Journal";
}

std::string RLTrainingJournalPlugin::GetMenuName()
{
    return "rltrainingjournal"; // internal menu name (no spaces)
}

std::string RLTrainingJournalPlugin::GetMenuTitle()
{
    return "RL Training Journal"; // title shown in the BakkesMod menu
}

void RLTrainingJournalPlugin::SetImGuiContext(uintptr_t ctx)
{
    // BakkesMod passes an ImGuiContext pointer as an integer. Store it so
    // Render/RenderSettings can set it on whichever thread executes them.
    imguiContext_ = reinterpret_cast<ImGuiContext*>(ctx);
    DiagnosticLogger::Log(std::string("SetImGuiContext: stored context ptr=") + std::to_string(reinterpret_cast<uintptr_t>(imguiContext_)));
}

void RLTrainingJournalPlugin::ApplyBaseUrl(const std::string& newUrl)
{
    if (!cvarManager)
    {
        return;
    }

    try
    {
        auto baseCvar = cvarManager->getCvar(kBaseUrlCvarName);
        baseCvar.setValue(newUrl);
    }
    catch (...)
    {
    }

    if (apiClient)
    {
        apiClient->SetBaseUrl(newUrl);
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

    ServerWrapper server = gameWrapper->GetOnlineGame();
    if (!server)
    {
        server = gameWrapper->GetGameEventAsServer();
    }

    if (!server)
    {
        if (cvarManager)
        {
            cvarManager->log("RTJ: no active server to report");
        }
        return;
    }

    const std::string payload = BuildMatchPayload(server);
    DispatchPayloadAsync("/api/mmr-log", payload);
}
