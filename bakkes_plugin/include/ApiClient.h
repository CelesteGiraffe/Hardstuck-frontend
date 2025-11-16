#pragma once

#include <string>
#include <vector>

struct HttpHeader
{
    std::string name;
    std::string value;
};

class ApiClient
{
public:
    explicit ApiClient(std::string baseUrl);

    void SetBaseUrl(std::string baseUrl);

    bool PostJson(const std::string& endpoint,
                  const std::string& body,
                  const std::vector<HttpHeader>& headers,
                  std::string& error) const;

private:
    std::string baseUrl;

    std::string NormalizeBaseUrl(const std::string& url) const;
    std::string BuildUrl(const std::string& endpoint) const;
};
