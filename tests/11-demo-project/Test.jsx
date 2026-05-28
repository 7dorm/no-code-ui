import React from 'react';
import ExtractedBlock from "./ExtractedBlock";
function Test() {
  return <div style={{
    width: "min-content",
    height: 86.4,
    display: "flex",
    justifyContent: "space-between",
    flexDirection: "row",
    backgroundColor: "#cb4d4d",
    borderRadius: 10
  }}>
    
    
    <div>Новый блок</div>
    <ExtractedBlock />
    
  </div>;
}
export default Test;
