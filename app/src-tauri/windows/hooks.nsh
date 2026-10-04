; CapeWatch installer hooks: register the capewatch:// address so a click on a CapeWatch notification can
; start the app even when it is closed (Windows opens capewatch://cape/<id>). Removed again on uninstall.
!macro NSIS_HOOK_POSTINSTALL
  WriteRegStr HKCU "Software\Classes\capewatch" "" "URL:CapeWatch"
  WriteRegStr HKCU "Software\Classes\capewatch" "URL Protocol" ""
  WriteRegStr HKCU "Software\Classes\capewatch\DefaultIcon" "" "$INSTDIR\capewatch.exe,0"
  WriteRegStr HKCU "Software\Classes\capewatch\shell\open\command" "" '"$INSTDIR\capewatch.exe" "%1"'
!macroend

; A real uninstall leaves nothing in the registry. (An update also runs the old uninstaller, with /UPDATE:
; then nothing is removed, the new version puts everything back right after.) The "start with Windows" entry,
; the shortcuts and the Programs list entry are removed by Tauri's own uninstaller. The settings and logs folder
; is removed only when the user ticks "Delete the application data" in the uninstaller.
!macro NSIS_HOOK_POSTUNINSTALL
  ${If} $UpdateMode <> 1
    ; capewatch:// only if it still opens this copy: another CapeWatch on this PC may own it now
    ReadRegStr $0 HKCU "Software\Classes\capewatch\shell\open\command" ""
    ${If} $0 == '"$INSTDIR\capewatch.exe" "%1"'
      DeleteRegKey HKCU "Software\Classes\capewatch"
    ${EndIf}
    ; Windows' own notification settings for this app, and the installer's note of where it was installed
    DeleteRegKey HKCU "Software\Microsoft\Windows\CurrentVersion\Notifications\Settings\${BUNDLEID}"
    DeleteRegKey HKCU "${MANUPRODUCTKEY}"
    DeleteRegKey /ifempty HKCU "${MANUKEY}"
  ${EndIf}
!macroend
