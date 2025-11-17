#pragma once

#include <string>
#include <vector>
#include <future>
#include <mutex>
#include <memory>
#include <chrono>
#include <filesystem>

// Forward declarations for trimmed SDK types / helpers
class CVarManagerWrapper;
class CVarWrapper;
class GameWrapper;
class ServerWrapper;
class UniqueIDWrapper;

#include "ApiClient.h"

struct ImGuiContext;

#include "bakkesmod/plugin/bakkesmodplugin.h"
#include "bakkesmod/plugin/pluginwindow.h"
#include "bakkesmod/plugin/pluginsettingswindow.h"

class RLTrainingJournalPlugin : public BakkesMod::Plugin::BakkesModPlugin,
                                public BakkesMod::Plugin::PluginSettingsWindow,
                                public BakkesMod::Plugin::PluginWindow
{
public:
    // Lifecycle
    void onLoad() override;
    void onUnload() override;

    // UI hooks
    void Render() override;
    void RenderSettings() override;
    void SetImGuiContext(uintptr_t ctx) override;
    bool ShouldBlockInput() override;
    bool IsActiveOverlay() override;
    void OnOpen() override;
    void OnClose() override;

    // Helpers
    std::string GetPluginName() override;
    std::string GetMenuName() override;
    std::string GetMenuTitle() override;

    // Functionality used in implementation
    void RegisterCVars();
    void HookMatchEvents();
    void HandleGameEnd(std::string eventName);
    void HandleReplayRecorded(std::string eventName);
    ServerWrapper ResolveActiveServer(GameWrapper* gw) const;
    bool CaptureServerAndUpload(ServerWrapper server, const char* contextTag);
    void CacheLastPayload(const std::string& payload, const char* contextTag);
    bool DispatchCachedPayload(const char* reason);
    std::vector<std::string> BuildMmrSnapshotPayloads() const;
    bool UploadMmrSnapshot(const char* contextTag);
    bool HasValidUniqueId(UniqueIDWrapper& uniqueId) const;
    void LoadPersistedSettings();
    void SavePersistedSettings();
    std::filesystem::path GetSettingsPath() const;
    std::string FormatTimestamp(const std::chrono::system_clock::time_point& tp) const;
    std::string Escape(const std::string& value) const;
    std::string PlaylistNameFromServer(ServerWrapper server) const;
    std::string SerializeTeams(ServerWrapper server) const;
    std::string SerializeScoreboard(ServerWrapper server) const;
    std::string BuildMatchPayload(ServerWrapper server) const;
    void DispatchPayloadAsync(const std::string& endpoint, const std::string& body);
    void CleanupFinishedRequests();
    void ApplyBaseUrl(const std::string& newUrl);
    void TriggerManualUpload();

    // State
    std::unique_ptr<ApiClient> apiClient;

    std::mutex requestMutex;
    std::vector<std::future<void>> pendingRequests;
    std::string lastResponseMessage;
    std::string lastErrorMessage;
    std::mutex payloadMutex_;
    std::string lastPayload_;
    std::string lastPayloadContext_;

    bool forceLocalhost_ = true;
    ImGuiContext* imguiContext_ = nullptr;
    bool menuOpen_ = false;
};
