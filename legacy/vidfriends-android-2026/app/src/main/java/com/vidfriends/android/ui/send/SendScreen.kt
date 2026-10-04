package com.vidfriends.android.ui.send

import android.net.Uri
import android.provider.OpenableColumns
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.contract.ActivityResultContracts
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
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.Button
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.SegmentedButton
import androidx.compose.material3.SegmentedButtonDefaults
import androidx.compose.material3.SingleChoiceSegmentedButtonRow
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.unit.dp
import androidx.hilt.navigation.compose.hiltViewModel
import com.vidfriends.android.ui.components.ErrorView
import com.vidfriends.android.ui.components.LoadingIndicator

@Composable
fun SendScreen(
    viewModel: SendViewModel = hiltViewModel(),
    onNavigateToFeed: () -> Unit = {},
    onNavigateToVideo: (String) -> Unit = {},
) {
    val state by viewModel.uiState.collectAsState()

    LaunchedEffect(state.result) {
        state.result?.let { video ->
            onNavigateToVideo(video.id)
        }
    }

    when {
        state.isSending -> {
            SendProgressContent()
        }
        state.error != null && state.result == null -> {
            ErrorView(
                message = state.error!!,
                onRetry = {
                    viewModel.clearError()
                    if (state.mode == SendMode.URL_PASTE) {
                        viewModel.sendLink()
                    } else {
                        viewModel.uploadFile()
                    }
                },
            )
        }
        else -> {
            SendFormContent(
                state = state,
                onModeChange = { viewModel.setMode(it) },
                onUrlChange = { viewModel.setUrl(it) },
                onCaptionChange = { viewModel.setCaption(it) },
                onFileSelected = { uri, name -> viewModel.onFileSelected(uri, name) },
                onClearFile = { viewModel.clearFile() },
                onSendLink = { viewModel.sendLink() },
                onUploadFile = { viewModel.uploadFile() },
                onNavigateToFeed = onNavigateToFeed,
            )
        }
    }
}

@Composable
private fun SendProgressContent() {
    Column(
        modifier = Modifier.fillMaxSize(),
        horizontalAlignment = Alignment.CenterHorizontally,
        verticalArrangement = Arrangement.Center,
    ) {
        CircularProgressIndicator(modifier = Modifier.size(64.dp))
        Spacer(Modifier.height(16.dp))
        Text(
            text = "Sending video...",
            style = MaterialTheme.typography.titleMedium,
        )
    }
}

@OptIn(ExperimentalMaterial3Api::class)
@Composable
private fun SendFormContent(
    state: SendUiState,
    onModeChange: (SendMode) -> Unit,
    onUrlChange: (String) -> Unit,
    onCaptionChange: (String) -> Unit,
    onFileSelected: (Uri, String) -> Unit,
    onClearFile: () -> Unit,
    onSendLink: () -> Unit,
    onUploadFile: () -> Unit,
    onNavigateToFeed: () -> Unit,
) {
    val context = LocalContext.current

    val filePickerLauncher = rememberLauncherForActivityResult(
        contract = ActivityResultContracts.GetContent(),
    ) { uri: Uri? ->
        uri?.let {
            val cursor = context.contentResolver.query(it, null, null, null, null)
            val name = cursor?.use { c ->
                val nameIndex = c.getColumnIndex(OpenableColumns.DISPLAY_NAME)
                c.moveToFirst()
                c.getString(nameIndex)
            } ?: "video.mp4"
            onFileSelected(it, name)
        }
    }

    Column(
        modifier = Modifier
            .fillMaxSize()
            .verticalScroll(rememberScrollState())
            .padding(16.dp),
    ) {
        Text(
            text = "Send Video",
            style = MaterialTheme.typography.headlineMedium,
        )

        Spacer(Modifier.height(16.dp))

        SingleChoiceSegmentedButtonRow(modifier = Modifier.fillMaxWidth()) {
            SegmentedButton(
                selected = state.mode == SendMode.URL_PASTE,
                onClick = { onModeChange(SendMode.URL_PASTE) },
                shape = SegmentedButtonDefaults.itemShape(index = 0, count = 2),
            ) {
                Text("URL")
            }
            SegmentedButton(
                selected = state.mode == SendMode.FILE_PICKER,
                onClick = { onModeChange(SendMode.FILE_PICKER) },
                shape = SegmentedButtonDefaults.itemShape(index = 1, count = 2),
            ) {
                Text("File")
            }
        }

        Spacer(Modifier.height(16.dp))

        if (state.mode == SendMode.URL_PASTE) {
            OutlinedTextField(
                value = state.url,
                onValueChange = onUrlChange,
                label = { Text("Video URL") },
                placeholder = { Text("https://example.com/video.mp4") },
                modifier = Modifier.fillMaxWidth(),
                singleLine = true,
                enabled = !state.isSending,
            )

            Spacer(Modifier.height(12.dp))

            OutlinedTextField(
                value = state.caption,
                onValueChange = onCaptionChange,
                label = { Text("Caption (optional)") },
                modifier = Modifier.fillMaxWidth(),
                maxLines = 3,
                enabled = !state.isSending,
            )

            Spacer(Modifier.height(16.dp))

            Button(
                onClick = onSendLink,
                modifier = Modifier.fillMaxWidth(),
                enabled = state.url.isNotBlank() && !state.isSending,
            ) {
                Text("Send Link")
            }
        } else {
            if (state.selectedFileUri == null) {
                OutlinedButton(
                    onClick = { filePickerLauncher.launch("video/*") },
                    modifier = Modifier.fillMaxWidth(),
                    enabled = !state.isSending,
                ) {
                    Text("Select Video File")
                }
            } else {
                Text(
                    text = "Selected: ${state.selectedFileName}",
                    style = MaterialTheme.typography.bodyMedium,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                )

                Spacer(Modifier.height(12.dp))

                OutlinedButton(
                    onClick = onClearFile,
                    enabled = !state.isSending,
                ) {
                    Text("Clear Selection")
                }
            }

            Spacer(Modifier.height(12.dp))

            OutlinedTextField(
                value = state.caption,
                onValueChange = onCaptionChange,
                label = { Text("Caption (optional)") },
                modifier = Modifier.fillMaxWidth(),
                maxLines = 3,
                enabled = !state.isSending,
            )

            Spacer(Modifier.height(16.dp))

            Button(
                onClick = onUploadFile,
                modifier = Modifier.fillMaxWidth(),
                enabled = state.selectedFileUri != null && !state.isSending,
            ) {
                Text("Upload Video")
            }
        }

        Spacer(Modifier.height(8.dp))

        OutlinedButton(
            onClick = onNavigateToFeed,
            modifier = Modifier.fillMaxWidth(),
        ) {
            Text("Back to Feed")
        }
    }
}
