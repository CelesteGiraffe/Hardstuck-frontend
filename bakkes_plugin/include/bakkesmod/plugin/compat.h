#pragma once
#include "bakkesmod/plugin/PluginSettingsWindow.h"
#include "bakkesmod/plugin/pluginwindow.h"

// Compatibility shims for older plugin code that expects unqualified
// `SettingsWindowBase` and `PluginWindowBase` types in the global namespace.
// These provide lightweight defaults so the existing plugin class can
// continue to derive from the same names without implementing every
// newer SDK virtual method.

class SettingsWindowBase : public BakkesMod::Plugin::PluginSettingsWindow {
public:
    void SetImGuiContext(uintptr_t) override {}
};

class PluginWindowBase : public BakkesMod::Plugin::PluginWindow {
public:
    std::string GetMenuName() override { return std::string(); }
    std::string GetMenuTitle() override { return std::string(); }
    void SetImGuiContext(uintptr_t) override {}
    bool ShouldBlockInput() override { return false; }
    bool IsActiveOverlay() override { return false; }
    void OnOpen() override {}
    void OnClose() override {}
};
