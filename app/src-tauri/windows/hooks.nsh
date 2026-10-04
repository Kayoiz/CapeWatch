; CapeWatch installer hooks: register the capewatch:// address so a click on a CapeWatch notification can
; start the app even when it is closed (Windows opens capewatch://cape/<id>). Removed again on uninstall.
!macro NSIS_HOOK_POSTINSTALL
  WriteRegStr HKCU "Software\Classes\capewatch" "" "URL:CapeWatch"
  WriteRegStr HKCU "Software\Classes\capewatch" "URL Protocol" ""
  WriteRegStr HKCU "Software\Classes\capewatch\DefaultIcon" "" "$INSTDIR\capewatch.exe,0"
  WriteRegStr HKCU "Software\Classes\capewatch\shell\open\command" "" '"$INSTDIR\capewatch.exe" "%1"'
!macroend

!macro NSIS_HOOK_POSTUNINSTALL
  DeleteRegKey HKCU "Software\Classes\capewatch"
!macroend
