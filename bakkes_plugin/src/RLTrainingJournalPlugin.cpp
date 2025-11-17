#include "RLTrainingJournalPlugin.h"

#include "bakkesmod/wrappers/GameWrapper.h"
#include "bakkesmod/wrappers/ArrayWrapper.h"
#include "bakkesmod/wrappers/CarWrapper.h"
#include "bakkesmod/wrappers/PriWrapper.h"
#include "bakkesmod/wrappers/TeamWrapper.h"
#include "bakkesmod/wrappers/PlaylistWrapper.h"
#include "bakkesmod/wrappers/MMRWrapper.h"
#include "bakkesmod/wrappers/UniqueIDWrapper.h"
#include "bakkesmod/wrappers/UnrealStringWrapper.h"

#include "imgui/imgui.h"

#include <algorithm>
#include <cmath>
#include <ctime>
#include <future>
#include <iomanip>
#include <sstream>
#include <thread>
#include <unordered_map>

BAKKESMOD_PLUGIN(RLTrainingJournalPlugin, "RL Trainer", "1.0", PERMISSION_ALL)

namespace
{
    constexpr char kBaseUrlCvarName[] = "rtj_api_base_url";
    constexpr char kUserIdCvarName[] = "rtj_user_id";
    constexpr char kGamesPlayedCvarName[] = "rtj_games_played_increment";
}

void RLTrainingJournalPlugin::onLoad()
{
    RegisterCVars();
    HookMatchEvents();

    std::string baseUrl = cvarManager->getCvar(kBaseUrlCvarName).getStringValue();
    apiClient = std::make_unique<ApiClient>(baseUrl);

    cvarManager->log("RL Training Journal plugin loaded");
}

void RLTrainingJournalPlugin::onUnload()
{
    std::lock_guard<std::mutex> lock(requestMutex);
    pendingRequests.clear();
    apiClient.reset();
}

void RLTrainingJournalPlugin::RegisterCVars()
{
    auto baseUrl = cvarManager->registerCvar(kBaseUrlCvarName, "http://localhost:4000", "Base URL for the RL Training Journal API");
    baseUrl.addOnValueChanged([this](std::string, CVarWrapper cvar) {
        if (apiClient)
        {
            apiClient->SetBaseUrl(cvar.getStringValue());
        }
    });

    cvarManager->registerCvar(kUserIdCvarName, "test-player", "User identifier sent as X-User-Id when uploading matches");
    cvarManager->registerCvar(kGamesPlayedCvarName, "1", "Increment for gamesPlayedDiff payload field");

    cvarManager->registerNotifier("rtj_force_upload", [this](std::vector<std::string>) {
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

        const std::string payload = BuildMatchPayload(server);
        DispatchPayloadAsync("/api/mmr-log", payload);
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
    DispatchPayloadAsync("/api/mmr-log", payload);
}

void RLTrainingJournalPlugin::HandleReplayRecorded(std::string)
{
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

    ImGui::TextWrapped("Uploads match summaries to the Rocket League Training Journal API.");
    if (!lastResponse.empty())
    {
        ImGui::TextWrapped("Last response: %s", lastResponse.c_str());
    }
    if (!lastError.empty())
    {
        ImGui::TextWrapped("Last error: %s", lastError.c_str());
    }
}

void RLTrainingJournalPlugin::RenderSettings()
{
    ImGui::TextUnformatted("Configure the Rocket League Training Journal plugin via console CVars:");
    ImGui::BulletText("%s - API base URL", kBaseUrlCvarName);
    ImGui::BulletText("%s - User identifier", kUserIdCvarName);
    ImGui::BulletText("%s - gamesPlayedDiff field", kGamesPlayedCvarName);
    ImGui::Spacing();
    ImGui::TextWrapped("Use `rtj_force_upload` to immediately push the current match payload to the API. Matches are also sent automatically when online games end or when a replay is recorded.");
}

std::string RLTrainingJournalPlugin::GetPluginName()
{
    return "RL Training Journal";
}
