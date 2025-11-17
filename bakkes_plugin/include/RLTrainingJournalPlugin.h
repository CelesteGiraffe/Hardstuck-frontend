#pragma once

#if __has_include("bakkesmod/plugin/bakkesmodplugin.h")
#include "bakkesmod/plugin/bakkesmodplugin.h"
#include "bakkesmod/plugin/PluginSettingsWindow.h"
#include "bakkesmod/plugin/PluginWindow.h"
#include "bakkesmod/plugin/compat.h"
#else
#include "bakkesmod_stubs.h"
#endif

#include "ApiClient.h"

#include <chrono>
#include <future>
#include <memory>
#include <mutex>
#include <string>
#include <vector>

// Forward-declare ImGuiContext so we can store a pointer without pulling in
// the full Dear ImGui headers in this public header.
struct ImGuiContext;

// Forward declarations from the BakkesMod SDK wrappers used in method signatures.
// Keep the header lightweight and avoid pulling in heavy wrapper headers here.
class ServerWrapper;

class RLTrainingJournalPlugin final : public BakkesMod::Plugin::BakkesModPlugin,
                                     public SettingsWindowBase,
                                     public PluginWindowBase
{
public:
    void onLoad() override;
    void onUnload() override;

    void RenderSettings() override;
    void Render() override;
    std::string GetPluginName() override;
    std::string GetMenuName() override;
    std::string GetMenuTitle() override;
    void SetImGuiContext(uintptr_t ctx) override;

private:
    void RegisterCVars();
    void HookMatchEvents();
    void HandleGameEnd(std::string eventName);
    void HandleReplayRecorded(std::string eventName);
    std::string BuildMatchPayload(ServerWrapper server) const;
    std::string SerializeScoreboard(ServerWrapper server) const;
    std::string SerializeTeams(ServerWrapper server) const;
    std::string PlaylistNameFromServer(ServerWrapper server) const;
    std::string FormatTimestamp(const std::chrono::system_clock::time_point& timePoint) const;
    std::string Escape(const std::string& value) const;
    void DispatchPayloadAsync(const std::string& endpoint, const std::string& body);
    void CleanupFinishedRequests();

    std::unique_ptr<ApiClient> apiClient;
    mutable std::mutex requestMutex;
    std::vector<std::future<void>> pendingRequests;
    std::string lastResponseMessage;
    std::string lastErrorMessage;
    // Stored ImGui context pointer provided by BakkesMod via SetImGuiContext.
    // We keep it and call ImGui::SetCurrentContext() inside Render/RenderSettings
    // so the context is set on whichever thread performs rendering.
    ImGuiContext* imguiContext_ = nullptr;
    // Allow disabling the UI at runtime to avoid crashes while debugging.
    // Controlled by CVar `rtj_ui_enabled` (0 = disabled, 1 = enabled).
    bool uiEnabled_ = false;
};
