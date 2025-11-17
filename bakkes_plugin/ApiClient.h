#pragma once

#include <string>
#include <vector>

struct HttpHeader {
    std::string name;
    std::string value;

    HttpHeader() = default;
    HttpHeader(std::string n, std::string v) : name(std::move(n)), value(std::move(v)) {}
};

class ApiClient {
public:
    ApiClient(std::string baseUrl);
    void SetBaseUrl(std::string newBaseUrl);
    std::string NormalizeBaseUrl(const std::string& url) const;
    std::string BuildUrl(const std::string& endpoint) const;
    bool PostJson(const std::string& endpoint,
                  const std::string& body,
                  const std::vector<HttpHeader>& headers,
                  std::string& error) const;

private:
    std::string baseUrl;
};
