package com.web2app.template;

import android.app.Activity;
import android.os.Bundle;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import android.webkit.WebChromeClient;
import android.webkit.WebSettings;
import android.webkit.WebResourceRequest;
import android.net.Uri;
import android.content.Intent;
import android.view.KeyEvent;

public class MainActivity extends Activity {

    private WebView webView;
    private static final String TARGET_URL = "{{TARGET_URL}}";

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        setContentView(R.layout.activity_main);

        webView = (WebView) findViewById(R.id.webview);
        configureWebView();
        webView.loadUrl(TARGET_URL);
    }

    private void configureWebView() {
        WebSettings settings = webView.getSettings();

        // 启用JavaScript
        settings.setJavaScriptEnabled(true);

        // 启用DOM存储（localStorage, sessionStorage）
        settings.setDomStorageEnabled(true);

        // 启用数据库存储
        settings.setDatabaseEnabled(true);

        // 自适应屏幕
        settings.setUseWideViewPort(true);
        settings.setLoadWithOverviewMode(true);

        // 支持缩放
        settings.setSupportZoom(true);
        settings.setBuiltInZoomControls(true);
        settings.setDisplayZoomControls(false);

        // 允许混合内容（HTTP + HTTPS）
        settings.setMixedContentMode(WebSettings.MIXED_CONTENT_ALWAYS_ALLOW);

        // 缓存策略
        settings.setCacheMode(WebSettings.LOAD_DEFAULT);

        // 文件访问
        settings.setAllowFileAccess(true);
        settings.setAllowContentAccess(true);

        // 自动加载图片
        settings.setLoadsImagesAutomatically(true);

        // 设置编码
        settings.setDefaultTextEncodingName("utf-8");

        // WebViewClient：处理页面导航
        webView.setWebViewClient(new WebViewClient() {
            @Override
            public boolean shouldOverrideUrlLoading(WebView view, WebResourceRequest request) {
                String url = request.getUrl().toString();
                // 仅允许http/https协议，拦截其他协议（如tel:, mailto:等）
                if (url.startsWith("http://") || url.startsWith("https://")) {
                    view.loadUrl(url);
                    return false;
                }
                // 尝试用系统Intent处理非网页链接
                try {
                    Intent intent = new Intent(Intent.ACTION_VIEW, Uri.parse(url));
                    startActivity(intent);
                    return true;
                } catch (Exception e) {
                    return true;
                }
            }

            @Override
            public void onReceivedError(WebView view, WebResourceRequest request, android.webkit.WebResourceError error) {
                super.onReceivedError(view, request, error);
                // 显示错误页面
                String html = "<html><body style='display:flex;justify-content:center;align-items:center;height:100vh;margin:0;font-family:sans-serif;color:#666;'>"
                    + "<div style='text-align:center'><h2>页面加载失败</h2><p>请检查网络连接后重试</p></div></body></html>";
                view.loadData(html, "text/html", "utf-8");
            }
        });

        // WebChromeClient：处理JS弹窗、进度条等
        webView.setWebChromeClient(new WebChromeClient() {
            @Override
            public void onProgressChanged(WebView view, int newProgress) {
                super.onProgressChanged(view, newProgress);
                // 可扩展：更新加载进度
            }
        });
    }

    // 返回键在WebView内回退
    @Override
    public boolean onKeyDown(int keyCode, KeyEvent event) {
        if (keyCode == KeyEvent.KEYCODE_BACK && webView.canGoBack()) {
            webView.goBack();
            return true;
        }
        return super.onKeyDown(keyCode, event);
    }

    @Override
    protected void onResume() {
        super.onResume();
        if (webView != null) {
            webView.onResume();
        }
    }

    @Override
    protected void onPause() {
        super.onPause();
        if (webView != null) {
            webView.onPause();
        }
    }

    @Override
    protected void onDestroy() {
        if (webView != null) {
            webView.destroy();
            webView = null;
        }
        super.onDestroy();
    }
}
