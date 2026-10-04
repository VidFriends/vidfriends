package com.vidfriends.feature.auth

import androidx.compose.animation.AnimatedVisibility
import androidx.compose.animation.fadeIn
import androidx.compose.animation.fadeOut
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.CheckCircle
import androidx.compose.material.icons.filled.QrCodeScanner
import androidx.compose.material.icons.filled.Settings
import androidx.compose.material3.Button
import androidx.compose.material3.Card
import androidx.compose.material3.CardDefaults
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.unit.dp

@Composable
fun SetupScreen(
    uiState: SetupUiState,
    onServerUrlChanged: (String) -> Unit,
    onConnect: () -> Unit,
    onQrCodeScanned: (String) -> Unit,
    showScanner: Boolean,
    hasCameraPermission: Boolean,
    onToggleScanner: () -> Unit,
) {
    Column(
        modifier = Modifier
            .fillMaxSize()
            .verticalScroll(rememberScrollState())
            .padding(24.dp),
        horizontalAlignment = Alignment.CenterHorizontally,
    ) {
        Spacer(modifier = Modifier.height(48.dp))

        Icon(
            imageVector = Icons.Default.Settings,
            contentDescription = null,
            modifier = Modifier.size(64.dp),
            tint = MaterialTheme.colorScheme.primary,
        )

        Spacer(modifier = Modifier.height(16.dp))

        Text(
            text = "Server Setup",
            style = MaterialTheme.typography.headlineMedium,
        )

        Spacer(modifier = Modifier.height(8.dp))

        Text(
            text = "Enter your VidFriends server address or scan the QR code",
            style = MaterialTheme.typography.bodyMedium,
            color = MaterialTheme.colorScheme.onSurfaceVariant,
        )

        Spacer(modifier = Modifier.height(32.dp))

        OutlinedTextField(
            value = uiState.serverUrl,
            onValueChange = onServerUrlChanged,
            label = { Text("Server URL") },
            placeholder = { Text("https://example.com") },
            singleLine = true,
            keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Uri),
            modifier = Modifier.fillMaxWidth(),
            isError = uiState.error != null,
            supportingText = uiState.error?.let { error ->
                { Text(text = error, color = MaterialTheme.colorScheme.error) }
            },
        )

        Spacer(modifier = Modifier.height(12.dp))

        Row(
            modifier = Modifier.fillMaxWidth(),
            horizontalArrangement = Arrangement.spacedBy(12.dp),
        ) {
            Button(
                onClick = onConnect,
                modifier = Modifier.weight(1f),
                enabled = uiState.status != SetupStatus.Connecting,
            ) {
                if (uiState.status == SetupStatus.Connecting) {
                    CircularProgressIndicator(
                        modifier = Modifier.size(20.dp),
                        strokeWidth = 2.dp,
                        color = MaterialTheme.colorScheme.onPrimary,
                    )
                } else {
                    Text("Connect")
                }
            }

            OutlinedButton(onClick = onToggleScanner) {
                Icon(
                    imageVector = Icons.Default.QrCodeScanner,
                    contentDescription = "Scan QR",
                    modifier = Modifier.size(20.dp),
                )
                Text("Scan")
            }
        }

        Spacer(modifier = Modifier.height(16.dp))

        AnimatedVisibility(visible = showScanner && hasCameraPermission, enter = fadeIn(), exit = fadeOut()) {
            QrScannerView(
                modifier = Modifier.fillMaxWidth().height(250.dp),
                onQrCodeScanned = onQrCodeScanned,
            )
        }

        Spacer(modifier = Modifier.height(16.dp))

        AnimatedVisibility(visible = uiState.status == SetupStatus.Connected, enter = fadeIn(), exit = fadeOut()) {
            Card(
                colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.primaryContainer),
                shape = RoundedCornerShape(12.dp),
            ) {
                Row(modifier = Modifier.padding(16.dp), verticalAlignment = Alignment.CenterVertically) {
                    Icon(imageVector = Icons.Default.CheckCircle, contentDescription = null, tint = MaterialTheme.colorScheme.primary)
                    Spacer(modifier = Modifier.size(8.dp))
                    Text(text = "Connected successfully", style = MaterialTheme.typography.bodyMedium)
                }
            }
        }

        AnimatedVisibility(visible = uiState.status == SetupStatus.Error && uiState.error != null, enter = fadeIn(), exit = fadeOut()) {
            Card(
                colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.errorContainer),
                shape = RoundedCornerShape(12.dp),
            ) {
                Row(modifier = Modifier.padding(16.dp), verticalAlignment = Alignment.CenterVertically) {
                    Text(text = uiState.error ?: "", style = MaterialTheme.typography.bodyMedium, color = MaterialTheme.colorScheme.onErrorContainer)
                }
            }
        }

        AnimatedVisibility(visible = uiState.status == SetupStatus.Connecting, enter = fadeIn(), exit = fadeOut()) {
            Row(verticalAlignment = Alignment.CenterVertically) {
                CircularProgressIndicator(modifier = Modifier.size(16.dp), strokeWidth = 2.dp)
                Spacer(modifier = Modifier.size(8.dp))
                Text(text = "Connecting to server...", style = MaterialTheme.typography.bodySmall)
            }
        }
    }
}
