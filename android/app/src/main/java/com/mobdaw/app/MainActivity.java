package com.mobdaw.app;

import android.Manifest;
import android.app.Activity;
import android.content.pm.PackageManager;
import android.net.Uri;
import android.os.Bundle;
import android.webkit.MimeTypeMap;
import android.webkit.PermissionRequest;
import android.webkit.WebChromeClient;
import android.webkit.WebResourceResponse;
import android.webkit.WebResourceRequest;
import android.webkit.WebView;
import android.webkit.WebViewClient;

import java.io.ByteArrayInputStream;
import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.util.Collections;

public final class MainActivity extends Activity {
    private static final int AUDIO_PERMISSION_REQUEST = 1;
    private static final String APP_HOST = "appassets.androidplatform.net";
    private static final String ASSET_PATH_PREFIX = "/assets/web/";

    private WebView webView;
    private PermissionRequest pendingPermissionRequest;

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);

        webView = new WebView(this);
        webView.getSettings().setJavaScriptEnabled(true);
        webView.getSettings().setDomStorageEnabled(true);
        webView.getSettings().setMediaPlaybackRequiresUserGesture(false);
        webView.getSettings().setAllowFileAccess(false);
        webView.getSettings().setAllowContentAccess(false);
        webView.setWebViewClient(new WebViewClient() {
            @Override
            public android.webkit.WebResourceResponse shouldInterceptRequest(
                    WebView view, WebResourceRequest request) {
                return serveAppAsset(request.getUrl());
            }
        });
        webView.setWebChromeClient(new WebChromeClient() {
            @Override
            public void onPermissionRequest(PermissionRequest request) {
                runOnUiThread(new Runnable() {
                    @Override
                    public void run() {
                        grantAudioCapturePermission(request);
                    }
                });
            }
        });
        setContentView(webView);
        webView.loadUrl("https://" + APP_HOST + "/assets/web/index.html");
    }

    private WebResourceResponse serveAppAsset(Uri uri) {
        String path = uri.getPath();
        if (!"https".equals(uri.getScheme()) || !APP_HOST.equals(uri.getHost())) {
            return errorResponse(403, "Forbidden");
        }
        if (path == null || !path.startsWith(ASSET_PATH_PREFIX) || path.contains("..") || path.contains("\\")) {
            return errorResponse(404, "Not Found");
        }

        String assetPath = path.substring("/assets/".length());
        String extension = MimeTypeMap.getFileExtensionFromUrl(path);
        String mimeType = MimeTypeMap.getSingleton().getMimeTypeFromExtension(extension);
        if (mimeType == null) {
            mimeType = "application/octet-stream";
        }
        String encoding = mimeType.startsWith("text/")
                || mimeType.contains("javascript")
                || mimeType.contains("json")
                || mimeType.contains("xml")
                ? "UTF-8"
                : null;

        try {
            return new WebResourceResponse(mimeType, encoding, getAssets().open(assetPath));
        } catch (IOException exception) {
            return errorResponse(404, "Not Found");
        }
    }

    private WebResourceResponse errorResponse(int statusCode, String reasonPhrase) {
        byte[] body = reasonPhrase.getBytes(StandardCharsets.UTF_8);
        return new WebResourceResponse(
                "text/plain",
                "UTF-8",
                statusCode,
                reasonPhrase,
                Collections.emptyMap(),
                new ByteArrayInputStream(body)
        );
    }

    private void grantAudioCapturePermission(PermissionRequest request) {
        if (!APP_HOST.equals(request.getOrigin().getHost())) {
            request.deny();
            return;
        }

        String[] resources = request.getResources();
        if (resources.length != 1
                || !PermissionRequest.RESOURCE_AUDIO_CAPTURE.equals(resources[0])) {
            request.deny();
            return;
        }

        if (checkSelfPermission(Manifest.permission.RECORD_AUDIO) == PackageManager.PERMISSION_GRANTED) {
            request.grant(resources);
        } else {
            pendingPermissionRequest = request;
            requestPermissions(
                    new String[]{Manifest.permission.RECORD_AUDIO},
                    AUDIO_PERMISSION_REQUEST
            );
        }
    }

    @Override
    public void onRequestPermissionsResult(
            int requestCode, String[] permissions, int[] grantResults) {
        super.onRequestPermissionsResult(requestCode, permissions, grantResults);
        if (requestCode != AUDIO_PERMISSION_REQUEST || pendingPermissionRequest == null) {
            return;
        }

        if (grantResults.length > 0 && grantResults[0] == PackageManager.PERMISSION_GRANTED) {
            pendingPermissionRequest.grant(new String[]{PermissionRequest.RESOURCE_AUDIO_CAPTURE});
        } else {
            pendingPermissionRequest.deny();
        }
        pendingPermissionRequest = null;
    }

    @Override
    protected void onDestroy() {
        if (pendingPermissionRequest != null) {
            pendingPermissionRequest.deny();
            pendingPermissionRequest = null;
        }
        if (webView != null) {
            webView.destroy();
        }
        super.onDestroy();
    }
}
