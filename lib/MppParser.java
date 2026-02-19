import net.sf.mpxj.*;
import net.sf.mpxj.reader.*;
import java.io.*;
import java.time.LocalDateTime;
import java.time.format.DateTimeFormatter;
import java.util.*;

public class MppParser {
    private static final DateTimeFormatter dateFormat = DateTimeFormatter.ofPattern("yyyy-MM-dd");
    
    public static void main(String[] args) {
        if (args.length < 1) {
            System.err.println("Usage: java MppParser <mpp-file>");
            System.exit(1);
        }
        
        try {
            File file = new File(args[0]);
            ProjectReader reader = new UniversalProjectReader();
            ProjectFile projectFile = reader.read(file);
            
            StringBuilder json = new StringBuilder();
            json.append("{\"tasks\":[");
            
            boolean first = true;
            
            for (Task task : projectFile.getTasks()) {
                if (task.getID() == null || task.getID() == 0) continue;
                if (task.getName() == null || task.getName().trim().isEmpty()) continue;
                
                if (!first) json.append(",");
                first = false;
                
                json.append("{");
                json.append("\"taskId\":").append(task.getID()).append(",");
                json.append("\"wbs\":").append(escapeJson(task.getWBS())).append(",");
                json.append("\"taskName\":").append(escapeJson(task.getName())).append(",");
                
                LocalDateTime startDate = task.getStart();
                if (startDate != null) {
                    json.append("\"startDate\":\"").append(startDate.format(dateFormat)).append("\",");
                } else {
                    json.append("\"startDate\":null,");
                }
                
                LocalDateTime finishDate = task.getFinish();
                if (finishDate != null) {
                    json.append("\"finishDate\":\"").append(finishDate.format(dateFormat)).append("\",");
                } else {
                    json.append("\"finishDate\":null,");
                }
                
                Duration duration = task.getDuration();
                if (duration != null) {
                    json.append("\"duration\":\"").append(duration.toString()).append("\",");
                    double days = duration.convertUnits(TimeUnit.DAYS, projectFile.getProjectProperties()).getDuration();
                    json.append("\"durationDays\":").append((int)Math.ceil(days)).append(",");
                } else {
                    json.append("\"duration\":null,");
                    json.append("\"durationDays\":null,");
                }
                
                Number percentComplete = task.getPercentageComplete();
                json.append("\"percentComplete\":").append(percentComplete != null ? percentComplete.intValue() : 0).append(",");
                
                Integer outlineLevel = task.getOutlineLevel();
                json.append("\"outlineLevel\":").append(outlineLevel != null ? outlineLevel : 1).append(",");
                
                Task parent = task.getParentTask();
                if (parent != null && parent.getID() != null && parent.getID() != 0) {
                    json.append("\"parentTaskId\":").append(parent.getID()).append(",");
                } else {
                    json.append("\"parentTaskId\":null,");
                }
                
                json.append("\"isSummary\":").append(task.hasChildTasks()).append(",");
                json.append("\"isMilestone\":").append(task.getMilestone()).append(",");

                Duration work = task.getWork();
                if (work != null) {
                    double hours = work.convertUnits(TimeUnit.HOURS, projectFile.getProjectProperties()).getDuration();
                    json.append("\"workHours\":").append(Math.round(hours * 100.0) / 100.0).append(",");
                } else {
                    json.append("\"workHours\":null,");
                }

                List<Relation> predecessors = task.getPredecessors();
                if (predecessors != null && !predecessors.isEmpty()) {
                    json.append("\"predecessors\":[");
                    boolean firstPred = true;
                    for (Relation rel : predecessors) {
                        Task predTask = rel.getTargetTask();
                        if (predTask == null || predTask.getID() == null || predTask.getID() == 0) continue;
                        if (!firstPred) json.append(",");
                        firstPred = false;
                        json.append("{");
                        json.append("\"predecessorTaskId\":").append(predTask.getID()).append(",");
                        RelationType relType = rel.getType();
                        String typeStr = "FS";
                        if (relType == RelationType.START_START) typeStr = "SS";
                        else if (relType == RelationType.FINISH_FINISH) typeStr = "FF";
                        else if (relType == RelationType.START_FINISH) typeStr = "SF";
                        json.append("\"type\":\"").append(typeStr).append("\",");
                        Duration lag = rel.getLag();
                        int lagDays = 0;
                        if (lag != null) {
                            lagDays = (int) Math.round(lag.convertUnits(TimeUnit.DAYS, projectFile.getProjectProperties()).getDuration());
                        }
                        json.append("\"lagDays\":").append(lagDays);
                        json.append("}");
                    }
                    json.append("],");
                } else {
                    json.append("\"predecessors\":[],");
                }

                json.append("\"notes\":").append(escapeJson(task.getNotes()));
                json.append("}");
            }
            
            json.append("]}");
            System.out.println(json.toString());
            
        } catch (Exception e) {
            System.err.println("Error parsing MPP file: " + e.getMessage());
            e.printStackTrace(System.err);
            System.exit(1);
        }
    }
    
    private static String escapeJson(String value) {
        if (value == null) return "null";
        return "\"" + value
            .replace("\\", "\\\\")
            .replace("\"", "\\\"")
            .replace("\n", "\\n")
            .replace("\r", "\\r")
            .replace("\t", "\\t")
            + "\"";
    }
}
